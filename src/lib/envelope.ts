import { daysInMonth, monthStart, parseISO } from './date';
import type { FoodEntry } from './types';

/**
 * The state of one day in the month.
 *
 * The daily limit is not fixed. It is whatever is left in the month's pool
 * divided by the days still to come, recalculated every morning. Two things
 * follow from that, and they are the whole point of the model:
 *
 *   Overspend on one day — a bulk grocery run — drains the pool, so every
 *   remaining day's limit drops. The shop has been paid for; it should not
 *   also be paid for again out of later days.
 *
 *   Underspend does NOT raise tomorrow. Whatever is left of a finished day's
 *   limit is swept out of the pool into the eat-out pot, and pool/daysLeft
 *   comes out at exactly the same figure it was before. That equality is
 *   exact, not approximate: removing pool/daysLeft from the pool leaves
 *   pool·(daysLeft−1)/daysLeft, which divided by daysLeft−1 is pool/daysLeft
 *   again. A quiet day moves money sideways into the pot, not forward.
 */
export type DayState = {
  day: string;
  /** Pool ÷ days remaining, at the start of this day. */
  limit: number;
  /** Spending that draws on the day's limit. */
  spent: number;
  /** Spending drawn from the eat-out pot instead. */
  potSpent: number;
  /** Swept into the pot at the end of the day. Zero while the day is running. */
  toPot: number;
  poolAfter: number;
  potAfter: number;
};

export type Envelope = {
  month: string;
  monthlyBudget: number;
  /** Every day from the 1st through today. */
  days: DayState[];
  /** Today's limit — the headline figure. */
  dailyLimit: number;
  spentToday: number;
  /** Limit minus what today has already taken. Negative means over. */
  leftToday: number;
  /** Still in the month's pool, not counting the pot. */
  pool: number;
  /** The eat-out pot, built from days that came in under. */
  pot: number;
  /** Everything still unspent this month: pool plus pot. */
  leftThisMonth: number;
  spentMonth: number;
  daysLeft: number;
  daysInMonth: number;
};

/**
 * Replay the month a day at a time.
 *
 * Nothing about the pot is stored. It is derived from the entries every time,
 * which means editing or deleting an entry re-settles the whole month
 * correctly rather than leaving a stored balance that has quietly gone wrong.
 *
 * The pot starts each month at zero: whatever it holds on the last day is what
 * gets banked into savings, so it does not carry over.
 */
export function computeEnvelope(
  entries: FoodEntry[],
  today: string,
  dailyBudget: number,
): Envelope {
  const dim = daysInMonth(today);
  const dayOfMonth = parseISO(today).d;
  const month = today.slice(0, 7);
  const monthlyBudget = dailyBudget * dim;

  // Bucket the month's entries by day, split by which envelope they draw on.
  const start = monthStart(today);
  const byDay = new Map<string, { spent: number; potSpent: number }>();
  let spentMonth = 0;
  for (const e of entries) {
    if (e.spent_on < start || e.spent_on > today) continue;
    const row = byDay.get(e.spent_on) ?? { spent: 0, potSpent: 0 };
    if (e.from_pot) row.potSpent += e.amount;
    else row.spent += e.amount;
    byDay.set(e.spent_on, row);
    spentMonth += e.amount;
  }

  let pool = monthlyBudget;
  let pot = 0;
  const days: DayState[] = [];

  for (let d = 1; d <= dayOfMonth; d++) {
    const day = `${month}-${String(d).padStart(2, '0')}`;
    const daysLeft = dim - d + 1;
    // An overspent month can drive the pool negative; a negative limit would be
    // meaningless, so the floor is zero.
    const limit = Math.max(0, pool / daysLeft);
    const { spent, potSpent } = byDay.get(day) ?? { spent: 0, potSpent: 0 };

    // Pot purchases come out of the pot first. Anything beyond what the pot
    // holds falls back to the pool, so the books still balance.
    const drawnFromPot = Math.min(pot, potSpent);
    pot -= drawnFromPot;
    pool -= spent + (potSpent - drawnFromPot);

    // Only a finished day sweeps. Today is still being lived.
    let toPot = 0;
    if (d < dayOfMonth) {
      toPot = Math.max(0, limit - spent);
      pool -= toPot;
      pot += toPot;
    }

    days.push({ day, limit, spent, potSpent, toPot, poolAfter: pool, potAfter: pot });
  }

  const todayState = days[days.length - 1];

  return {
    month,
    monthlyBudget,
    days,
    dailyLimit: todayState?.limit ?? 0,
    spentToday: todayState?.spent ?? 0,
    leftToday: (todayState?.limit ?? 0) - (todayState?.spent ?? 0),
    pool,
    pot,
    // pool + pot is always monthlyBudget − spentMonth; see the test.
    leftThisMonth: pool + pot,
    spentMonth,
    daysLeft: dim - dayOfMonth + 1,
    daysInMonth: dim,
  };
}
