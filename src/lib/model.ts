import type { FoodEntry } from './types';

/**
 * Fallback daily allowance, used only before the config has loaded. The real
 * figure lives in `config.food.dailyBudget` and is editable in Settings.
 */
export const DEFAULT_DAILY_BUDGET = 500;

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
