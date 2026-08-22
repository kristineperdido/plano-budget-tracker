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

/** What an earmarked pot paid for in a month. */
export type EarmarkPayment = { potId: string; potLabel: string; amount: number };

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
  /**
   * Costs met by a pot that was put aside for them. Not a shortfall: money
   * doing the job it was saved for.
   */
  fromEarmark: EarmarkPayment[];
  paidFromEarmark: number;
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
  /** Each pot, what it was pointed at, and what is left of it at the end. */
  pots: {
    id: string;
    label: string;
    confidence: Confidence;
    amount: number;
    earmark: string[];
    spentOnEarmark: number;
    spentGenerally: number;
    remaining: number;
  }[];
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
  /**
   * What is left of the money you started with. Pots only — not reserves minus
   * totalGap, which stopped being true once earmarked money paid costs
   * directly, and not including anything earned along the way.
   */
  reservesLeft: number;
  /**
   * Everything you hold at the end: what is left of the reserves, plus surplus
   * kept from months that paid for themselves. These were one figure, which
   * made a plan ending on 55,115 of earnings look like 55,115 of savings.
   */
  inHandAtEnd: number;
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

  // Reserves are tracked pot by pot rather than as three totals, because a pot
  // can be pointed at particular costs and needs its own balance to draw down.
  const reserves = { committed: 0, uncertain: 0, backup: 0 };
  const pots = config.moneyIn
    .filter((m) => {
      const kind = confidenceOf(m);
      if (kind === 'uncertain' && !options.includeUncertain) return false;
      if (kind === 'backup' && !options.useBackup) return false;
      return true;
    })
    .map((m) => {
      const confidence = confidenceOf(m);
      reserves[confidence] += m.amount;
      return {
        id: m.id,
        label: m.label,
        confidence,
        amount: m.amount,
        earmark: m.earmark ?? [],
        spentOnEarmark: 0,
        spentGenerally: 0,
        remaining: m.amount,
      };
    });

  /** Money left over from a good month, spendable before any reserve. */
  let carried = 0;

  const left = (k: Confidence) =>
    pots.filter((p) => p.confidence === k).reduce((s, p) => s + p.remaining, 0);

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

    // A cost someone put money aside for is paid from that money first. It is
    // not a shortfall — it is the pot doing the job it was saved for — so it
    // comes out before the month's gap is worked out at all.
    const fromEarmark: EarmarkPayment[] = [];
    let paidFromEarmark = 0;
    for (const line of costLines) {
      let owing = line.amount;
      for (const pot of pots) {
        if (owing <= 0) break;
        if (!pot.earmark.includes(line.id) || pot.remaining <= 0) continue;
        const take = Math.min(pot.remaining, owing);
        pot.remaining -= take;
        pot.spentOnEarmark += take;
        owing -= take;
        paidFromEarmark += take;
        const seen = fromEarmark.find((e) => e.potId === pot.id);
        if (seen) seen.amount += take;
        else fromEarmark.push({ potId: pot.id, potLabel: pot.label, amount: take });
      }
    }

    // What the month still has to find, after earmarked money has done its job.
    const gap = income - (spend - paidFromEarmark);
    if (gap < 0) totalGap += -gap;

    let need = Math.max(0, -gap);

    // Last month's leftover is spent before any reserve is touched.
    const fromCarried = Math.min(carried, need);
    carried -= fromCarried;
    need -= fromCarried;

    // Then the pots, in order of how much they can be relied on.
    const drawn = { committed: 0, uncertain: 0, backup: 0 };
    for (const kind of ['committed', 'uncertain', 'backup'] as const) {
      for (const pot of pots) {
        if (need <= 0) break;
        if (pot.confidence !== kind || pot.remaining <= 0) continue;
        const take = Math.min(pot.remaining, need);
        pot.remaining -= take;
        pot.spentGenerally += take;
        drawn[kind] += take;
        need -= take;
      }
    }

    // Anything left over at the end of a month is money in hand.
    if (gap > 0) carried += gap;

    const needsUncertain = drawn.uncertain > 0;
    const needsBackup = drawn.backup > 0;
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
      fromEarmark,
      paidFromEarmark,
      committedLeft: left('committed') + carried,
      uncertainLeft: left('uncertain'),
      backupLeft: left('backup'),
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
  const potsLeft = left('committed') + left('uncertain') + left('backup');
  const leftOver = carried + potsLeft;
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
    pots,
    lastsUntil: monthsCovered === 0 ? null : covered[monthsCovered - 1]?.month ?? null,
    monthsCovered,
    projectedDry,
    monthsBeyond,
    totalGap,
    endsWith: carried + left('committed'),
    reservesLeft: potsLeft,
    inHandAtEnd: leftOver,
  };
}
