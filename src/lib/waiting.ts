import { daysBetween } from './date';
import { closeMonth, monthOf, settle, settledMonths } from './close';
import { computeEnvelope } from './envelope';
import type { SavingsEntry } from './savings';
import { phaseSpans } from './phase';
import type { BillPayment } from './bills';
import type { Config } from './config';
import type { FoodEntry } from './types';

/** One thing outstanding, in the order it is worth being told about. */
export type Waiting = { id: string; text: string };

export type Standing = {
  /** Null once tracking has begun. */
  daysUntilStart: number | null;
  /** Where you are once it has: "month 2 of 5" and the phase's name. */
  monthOfPlan: number | null;
  totalMonths: number;
  phaseLabel: string | null;
  waiting: Waiting[];
};

/**
 * Everything the welcome screen says, worked out in one place.
 *
 * Deliberately quiet: each item only appears when it is actually true, so the
 * list is empty on a day with nothing to do rather than becoming a row of
 * zeroes to scroll past.
 */
export function standing(
  config: Config,
  today: string,
  entries: FoodEntry[],
  bills: BillPayment[],
  savings: SavingsEntry[],
  noSpendDays: string[],
): Standing {
  const started = today >= config.startDate;
  const spans = phaseSpans(config, 0);
  const total = spans.reduce((s, sp) => s + sp.phase.months, 0);

  let monthOfPlan: number | null = null;
  let phaseLabel: string | null = null;
  if (started) {
    const [y, m] = config.startMonth.split('-').map(Number);
    const [ty, tm] = today.slice(0, 7).split('-').map(Number);
    const index = (ty - y) * 12 + (tm - m);
    if (index >= 0 && index < total) {
      monthOfPlan = index + 1;
      phaseLabel = spans.find((sp) => index >= sp.from && index <= sp.to)?.phase.label ?? null;
    }
  }

  const waiting: Waiting[] = [];

  if (started) {
    const env = computeEnvelope(entries, today, config.food.dailyBudget, {
      startDate: config.startDate,
      noSpendDays,
    });

    if (env.unaccounted.length > 0) {
      const n = env.unaccounted.length;
      waiting.push({
        id: 'unaccounted',
        text: `${n} ${n === 1 ? 'day needs' : 'days need'} an answer`,
      });
    }

    // A finished month that has not been banked or drawn down yet.
    const done = settledMonths(savings);
    const previous = (() => {
      const [y, m] = monthOf(today).split('-').map(Number);
      return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
    })();
    if (previous >= config.startMonth.slice(0, 7) && !done.has(previous)) {
      const close = closeMonth(config, previous, entries, bills, today);
      if (close.complete && close.daysCovered > 0) {
        waiting.push({
          id: 'month',
          text:
            close.surplus > 0
              ? `${previous} is ready to bank`
              : `${previous} went over and needs recording`,
        });
      }
    }

    // Bills the plan expected this month that nobody has put a figure to.
    const thisMonth = closeMonth(config, monthOf(today), entries, bills, today);
    if (thisMonth.billsMissing > 0) {
      const n = thisMonth.billsMissing;
      waiting.push({
        id: 'bills',
        text: `${n} ${n === 1 ? 'bill has' : 'bills have'} no figure yet`,
      });
    }

    const owed = settle(entries);
    if (owed.creditor && owed.amount > 0) {
      waiting.push({ id: 'owed', text: 'there is money to square up' });
    }
  }

  return {
    daysUntilStart: started ? null : daysBetween(today, config.startDate),
    monthOfPlan,
    totalMonths: total,
    phaseLabel,
    waiting,
  };
}
