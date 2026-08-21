import { daysCoveredInMonth, monthOfIndex } from './date';
import { applyPayer, phaseOf, totalMonths } from './engine';
import type { Config, LineItem, MoneyIn } from './config';

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

export type MonthFlow = {
  index: number;
  /** Calendar month, YYYY-MM. */
  month: string;
  phaseId: string | null;
  phaseLabel: string | null;
  income: number;
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
  /** Total shortfall across the plan, before any reserves. */
  totalGap: number;
  /** What is left over at the end, counting only committed money. */
  endsWith: number;
};

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
export function computeCashflow(config: Config): Cashflow {
  const months = totalMonths(config.phases);

  const reserves = { committed: 0, uncertain: 0, backup: 0 };
  for (const m of config.moneyIn) reserves[confidenceOf(m)] += m.amount;

  let committed = reserves.committed;
  let uncertain = reserves.uncertain;
  let backup = reserves.backup;

  const out: MonthFlow[] = [];
  let firstMonthNeedingUncertain: string | null = null;
  let firstMonthShort: string | null = null;
  let totalGap = 0;

  for (let i = 0; i < months; i++) {
    const phase = phaseOf(config.phases, i);
    const month = monthOfIndex(config.startMonth, i);

    const income = phase
      ? phase.income.her + phase.income.herSideHustle + phase.income.him
      : 0;

    let bills = 0;
    for (const item of config.items) {
      // The pending tray is excluded on purpose: these are costs nobody has
      // been able to price, and folding a guess in would make the plan look
      // worse than what is actually known.
      if (item.pending || !activeIn(item, i)) continue;
      const payer = phase?.payers[item.id] ?? item.payer;
      const s = applyPayer(item.amount, payer);
      bills += s.her + s.him;
    }

    const food = config.food.dailyBudget * daysCoveredInMonth(config.startDate, month);
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

  return {
    months: out,
    reserves,
    firstMonthNeedingUncertain,
    firstMonthShort,
    totalGap,
    endsWith: committed,
  };
}
