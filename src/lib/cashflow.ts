import { daysCoveredInMonth, monthOfIndex } from './date';
import { applyPayer, phaseOf, totalMonths } from './engine';
import { schemeFor, type Config, type LineItem, type MoneyIn } from './config';

/**
 * Whether a pot of money is money you can count on.
 *
 *   'committed'  in hand, or as good as
 *   'uncertain'  flagged as maybe — a repayment someone has promised
 *   'backup'     deliberately held back, not part of the plan
 */
export type Confidence = 'committed' | 'uncertain' | 'backup';

export function confidenceOf(m: MoneyIn): Confidence {
  if (m.backup) return 'backup';
  if (m.uncertain) return 'uncertain';
  return 'committed';
}

/** One entry in a month's breakdown. */
export type FlowLine = { id: string; label: string; amount: number };

export type MonthFlow = {
  index: number;
  /** Calendar month, YYYY-MM. */
  month: string;
  phaseId: string | null;
  phaseLabel: string | null;
  income: number;
  /** What made up the income, so the in-side itemises too. */
  incomeLines: FlowLine[];
  /**
   * Every cost charged this month, by name — the lines the scheme in force
   * puts on this month, plus food. Enough to check a total against reality
   * rather than take it on trust.
   */
  costLines: FlowLine[];
  /** Line items charged this month. */
  bills: number;
  food: number;
  out: number;
  /** income − out. Negative means this month cannot pay for itself. */
  gap: number;
  /**
   * Reserves left after this month, drawn down in confidence order: committed
   * money first, then uncertain, then backup.
   */
  committedLeft: number;
  uncertainLeft: number;
  backupLeft: number;
  /** True once committed money alone can no longer cover the run so far. */
  needsUncertain: boolean;
  /** True once even uncertain money is exhausted and backup is being spent. */
  needsBackup: boolean;
  /** True if nothing is left to cover this month at all. */
  short: boolean;
};

export type Cashflow = {
  months: MonthFlow[];
  reserves: { committed: number; uncertain: number; backup: number };
  /** The first month committed money runs out, or null if it never does. */
  firstMonthNeedingUncertain: string | null;
  /** The first month nothing covers, or null. */
  firstMonthShort: string | null;
  /**
   * How far the money actually goes: the last month that can be paid for in
   * full, and how many months that is. Null when the very first month already
   * cannot be covered.
   */
  lastsUntil: string | null;
  monthsCovered: number;
  /**
   * If the plan ends with money still in hand, the month it would give out
   * anyway — assuming the last month's shortfall keeps repeating. Null when the
   * plan already runs short inside its own window.
   *
   * Without this, "lasts until January" reads as a runway when it is really
   * just where the plan stops. The five-month plan ends with 2,261 against a
   * shortfall of 8,395 a month: about a week.
   */
  projectedDry: string | null;
  /** Whole extra months the reserves would cover past the end of the plan. */
  monthsBeyond: number;
  /** Total shortfall across the plan, before any reserves. */
  totalGap: number;
  /** What is left over at the end, counting only committed money. */
  endsWith: number;
};

/** `n` months after `month`, as YYYY-MM. */
function monthPlus(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number);
  const t = m + n;
  return `${y + Math.floor((t - 1) / 12)}-${String(((t - 1) % 12) + 1).padStart(2, '0')}`;
}

function activeIn(item: LineItem, month: number): boolean {
  return item.cadence === 'onetime' ? item.startMonth === month : month >= item.startMonth;
}

/**
 * Lay the plan out month by month and draw reserves down in order of how much
 * you can rely on them.
 *
 * `computePlan` answers "does it balance overall", by pouring income, savings
 * and a promised repayment into one bucket and subtracting everything. That can
 * report a healthy net for a plan that runs out of money in month one, and it
 * counts a maybe as though it were cash. This answers the different question:
 * at each point in time, is there anything left to pay with, and what kind of
 * money is it?
 */
export type CashflowOptions = {
  /** Count the repayment nobody has promised in writing as available. */
  includeUncertain: boolean;
  /** Charge the costs nobody has been able to price yet. */
  includePending: boolean;
  /**
   * Allow the reserve to be spent. Turning this off answers a different
   * question — how far the plan goes without touching the savings that were
   * meant to stay put.
   */
  useBackup: boolean;
};

const ALL_IN: CashflowOptions = {
  includeUncertain: true,
  includePending: false,
  useBackup: true,
};

export function computeCashflow(
  config: Config,
  options: CashflowOptions = ALL_IN,
): Cashflow {
  const months = totalMonths(config.phases, config.startMonth);

  // Reserves only count if the plan is allowed to spend them.
  const reserves = { committed: 0, uncertain: 0, backup: 0 };
  for (const m of config.moneyIn) {
    const kind = confidenceOf(m);
    if (kind === 'uncertain' && !options.includeUncertain) continue;
    if (kind === 'backup' && !options.useBackup) continue;
    reserves[kind] += m.amount;
  }

  let committed = reserves.committed;
  let uncertain = reserves.uncertain;
  let backup = reserves.backup;

  const out: MonthFlow[] = [];
  let firstMonthNeedingUncertain: string | null = null;
  let firstMonthShort: string | null = null;
  let totalGap = 0;

  for (let i = 0; i < months; i++) {
    const phase = phaseOf(config.phases, i, config.startMonth);
    const month = monthOfIndex(config.startMonth, i);

    // The names come straight from the phase, so whatever the couple called a
    // source is what the breakdown shows.
    const incomeLines: FlowLine[] = (phase?.income ?? [])
      .filter((src) => src.amount > 0)
      .map((src) => ({ id: src.id, label: src.label, amount: src.amount }));
    const income = incomeLines.reduce((a, l) => a + l.amount, 0);

    // The terms in force this month come from the phase's scheme.
    let bills = 0;
    const lines = [
      ...schemeFor(config, phase).items,
      // The pending tray is excluded unless asked for: these are costs nobody
      // has been able to price, and folding a guess in by default would make
      // the plan look worse than what is actually known.
      ...(options.includePending ? config.pending : []),
    ];
    const costLines: FlowLine[] = [];
    for (const item of lines) {
      // Pending-ness is decided by which list a line is in, but honour the flag
      // too: a line that carries it should never be charged, wherever it sits.
      if ((item.pending && !options.includePending) || !activeIn(item, i)) continue;
      const s = applyPayer(item.amount, item.payer);
      const cost = s.her + s.him;
      bills += cost;
      costLines.push({ id: item.id, label: item.label, amount: cost });
    }
    // Heaviest first: a month that surprises you is usually one big line.
    costLines.sort((a, b) => b.amount - a.amount);

    const days = daysCoveredInMonth(config.startDate, month);
    const food = config.food.dailyBudget * days;
    if (food > 0) {
      costLines.push({ id: 'food', label: `Food (${days} days)`, amount: food });
    }
    const spend = bills + food;
    const gap = income - spend;
    if (gap < 0) totalGap += -gap;

    // Draw down in confidence order, so the month that forces you onto money
    // you cannot count on is visible.
    let need = Math.max(0, -gap);
    const fromCommitted = Math.min(committed, need);
    committed -= fromCommitted;
    need -= fromCommitted;

    const fromUncertain = Math.min(uncertain, need);
    uncertain -= fromUncertain;
    need -= fromUncertain;

    const fromBackup = Math.min(backup, need);
    backup -= fromBackup;
    need -= fromBackup;

    // Anything left over at the end of a month is money in hand.
    if (gap > 0) committed += gap;

    const needsUncertain = fromUncertain > 0;
    const needsBackup = fromBackup > 0;
    const short = need > 0.005;

    if (needsUncertain && !firstMonthNeedingUncertain) firstMonthNeedingUncertain = month;
    if (short && !firstMonthShort) firstMonthShort = month;

    out.push({
      index: i,
      month,
      phaseId: phase?.id ?? null,
      phaseLabel: phase?.label ?? null,
      income,
      incomeLines,
      costLines,
      bills,
      food,
      out: spend,
      gap,
      committedLeft: committed,
      uncertainLeft: uncertain,
      backupLeft: backup,
      needsUncertain,
      needsBackup,
      short,
    });
  }

  const covered = out.filter((m) => !m.short);
  const firstShortIndex = out.findIndex((m) => m.short);
  const monthsCovered = firstShortIndex === -1 ? out.length : firstShortIndex;

  // How much further the money would go if nothing changed after the plan ends.
  const last = out[out.length - 1];
  const leftOver = committed + uncertain + backup;
  let projectedDry: string | null = null;
  let monthsBeyond = 0;
  if (firstShortIndex === -1 && last && last.gap < 0) {
    monthsBeyond = Math.floor(leftOver / -last.gap);
    projectedDry = monthPlus(last.month, monthsBeyond + 1);
  }

  return {
    months: out,
    reserves,
    firstMonthNeedingUncertain,
    firstMonthShort,
    lastsUntil: monthsCovered === 0 ? null : covered[monthsCovered - 1]?.month ?? null,
    monthsCovered,
    projectedDry,
    monthsBeyond,
    totalGap,
    endsWith: committed,
  };
}
