import { daysInMonth, monthIndexOf } from './date';
import { phaseOf } from './engine';
import type { Config, LineItem } from './config';
import type { BillPayment } from './bills';
import { owedOn, type FoodEntry } from './types';

/** YYYY-MM for a Manila calendar day. */
export function monthOf(iso: string): string {
  return iso.slice(0, 7);
}

/** The month before `month`, as YYYY-MM. */
export function previousMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return m === 1
    ? `${y - 1}-12`
    : `${y}-${String(m - 1).padStart(2, '0')}`;
}

/** Which line items the plan expects to be paid in a given calendar month. */
export function billsDueIn(config: Config, month: string): LineItem[] {
  const index = monthIndexOf(config.startMonth, `${month}-01`);
  if (index < 0 || !phaseOf(config.phases, index)) return [];
  return config.items.filter(
    (i) =>
      !i.pending &&
      (i.cadence === 'onetime' ? i.startMonth === index : index >= i.startMonth),
  );
}

export type BillVariance = {
  item: LineItem;
  planned: number;
  /** Null when nobody has said what it actually came to. */
  actual: number | null;
  /** Positive means it came in under the plan. Zero when unrecorded. */
  saved: number;
};

export type MonthClose = {
  month: string;
  /** True once the month is over, so its surplus is final. */
  complete: boolean;

  foodBudget: number;
  foodSpent: number;
  /** Positive when food came in under its allowance. */
  foodSaved: number;

  bills: BillVariance[];
  billsPlanned: number;
  billsActual: number;
  /** Positive when the bills that were recorded came in under the plan. */
  billsSaved: number;
  /** Bills the plan expected that nobody has recorded yet. */
  billsMissing: number;

  /** What there is to bank: food underspend plus bill variance. */
  surplus: number;
};

/**
 * Close out a calendar month. The surplus is food underspend plus the variance
 * on bills that actually have a recorded figure — an unrecorded bill counts as
 * neither saved nor overspent, because nobody has said what it came to yet.
 * `billsMissing` is what makes that gap visible rather than silently flattering
 * the total.
 */
export function closeMonth(
  config: Config,
  month: string,
  entries: FoodEntry[],
  payments: BillPayment[],
  today: string,
): MonthClose {
  const days = daysInMonth(`${month}-01`);
  const foodBudget = config.food.dailyBudget * days;
  const foodSpent = entries
    .filter((e) => monthOf(e.spent_on) === month)
    .reduce((s, e) => s + e.amount, 0);

  const paid = new Map(
    payments.filter((p) => p.for_month === month).map((p) => [p.item_id, p.amount]),
  );

  const bills: BillVariance[] = billsDueIn(config, month).map((item) => {
    const actual = paid.has(item.id) ? (paid.get(item.id) as number) : null;
    return {
      item,
      planned: item.amount,
      actual,
      saved: actual === null ? 0 : item.amount - actual,
    };
  });

  const recorded = bills.filter((b) => b.actual !== null);
  const billsPlanned = recorded.reduce((s, b) => s + b.planned, 0);
  const billsActual = recorded.reduce((s, b) => s + (b.actual as number), 0);

  return {
    month,
    complete: month < monthOf(today),
    foodBudget,
    foodSpent,
    foodSaved: foodBudget - foodSpent,
    bills,
    billsPlanned,
    billsActual,
    billsSaved: billsPlanned - billsActual,
    billsMissing: bills.length - recorded.length,
    surplus: foodBudget - foodSpent + (billsPlanned - billsActual),
  };
}

export type Settlement = {
  /** Email of the person who is owed, or null when nothing is outstanding. */
  creditor: string | null;
  /** Always positive. What the other person owes the creditor. */
  amount: number;
  /** Per person: what they are owed by the other, before netting off. */
  owedTo: Record<string, number>;
};

/**
 * Who owes whom, netted. Every shared entry credits whoever paid for it; the
 * two directions cancel, so what comes out is a single figure in one direction.
 *
 * This assumes two people — with a third the "other person" is ambiguous, and
 * the shape would have to name who owes rather than infer it.
 */
export function settle(entries: FoodEntry[]): Settlement {
  const owedTo: Record<string, number> = {};

  for (const e of entries) {
    const owed = owedOn(e);
    if (owed <= 0 || !e.person) continue;
    owedTo[e.person] = (owedTo[e.person] ?? 0) + owed;
  }

  const people = Object.keys(owedTo);
  if (people.length === 0) return { creditor: null, amount: 0, owedTo };

  // One person has covered shared costs and the other has not.
  if (people.length === 1) {
    return { creditor: people[0], amount: owedTo[people[0]], owedTo };
  }

  const [a, b] = people.sort((x, y) => owedTo[y] - owedTo[x]);
  const net = owedTo[a] - owedTo[b];
  if (Math.abs(net) < 0.005) return { creditor: null, amount: 0, owedTo };
  return { creditor: a, amount: net, owedTo };
}
