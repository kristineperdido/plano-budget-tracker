import { daysInMonth, monthStart, parseISO } from './date';
import type { FoodEntry } from './types';

/**
 * Fallback daily allowance, used only before the config has loaded. The real
 * figure lives in `config.food.dailyBudget` and is editable in Settings.
 */
export const DEFAULT_DAILY_BUDGET = 500;

// -------------------------------------------------------------- buffer math

export type TodayStats = {
  /** Days of the month elapsed, today included. */
  daysElapsed: number;
  daysInMonth: number;
  /** The per-day allowance these figures were computed against. */
  dailyBudget: number;
  /** Budget accrued so far this month: dailyBudget x daysElapsed. */
  accrued: number;
  monthlyBudget: number;
  spentToday: number;
  spentMonth: number;
  /**
   * Accrued minus spent. Positive is money genuinely available to spend right
   * now (today's allowance plus whatever earlier days left behind); negative
   * means spending is ahead of pace.
   */
  buffer: number;
  /** Share of the month's budget already spent, clamped for the bar. */
  monthProgress: number;
  /** Where the month *should* be by now — the pace marker. */
  paceProgress: number;
  /** Projected month-end spend if the current daily rate holds. */
  projectedMonth: number;
};

export function computeToday(
  entries: FoodEntry[],
  today: string,
  dailyBudget: number = DEFAULT_DAILY_BUDGET,
): TodayStats {
  const dim = daysInMonth(today);
  const daysElapsed = parseISO(today).d;
  const start = monthStart(today);

  let spentToday = 0;
  let spentMonth = 0;
  for (const e of entries) {
    // Guard against rows outside the window; the query scopes this, but the
    // realtime channel can hand us anything.
    if (e.spent_on >= start && e.spent_on <= today) spentMonth += e.amount;
    if (e.spent_on === today) spentToday += e.amount;
  }

  const accrued = dailyBudget * daysElapsed;
  const monthlyBudget = dailyBudget * dim;

  return {
    daysElapsed,
    daysInMonth: dim,
    dailyBudget,
    accrued,
    monthlyBudget,
    spentToday,
    spentMonth,
    buffer: accrued - spentMonth,
    monthProgress: Math.min(spentMonth / monthlyBudget, 1),
    paceProgress: daysElapsed / dim,
    projectedMonth: (spentMonth / daysElapsed) * dim,
  };
}

/** Total per Manila day, newest first, for the recent-days ledger. */
export function byDay(entries: FoodEntry[]): { day: string; total: number; count: number }[] {
  const map = new Map<string, { day: string; total: number; count: number }>();
  for (const e of entries) {
    const row = map.get(e.spent_on) ?? { day: e.spent_on, total: 0, count: 0 };
    row.total += e.amount;
    row.count += 1;
    map.set(e.spent_on, row);
  }
  return [...map.values()].sort((a, b) => (a.day < b.day ? 1 : -1));
}

// ------------------------------------------------------------------ display

const peso = new Intl.NumberFormat('en-PH', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});
const peso2 = new Intl.NumberFormat('en-PH', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function php(n: number): string {
  return `₱${peso.format(Math.round(n))}`;
}

export function php2(n: number): string {
  return `₱${peso2.format(n)}`;
}
