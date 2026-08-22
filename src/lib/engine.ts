import { daysCoveredInMonth, monthOfIndex } from './date';
import {
  incomeOf,
  schemeFor,
  type Config,
  type FoodConfig,
  type LineItem,
  type Payer,
  type Phase,
} from './config';

export type ExtraForecast = {
  id: string;
  label: string;
  cost: number;
  perWeek: number;
  perDay: number;
  perMonth: number;
  /** What dropping one run a week frees up per month. */
  perSkippedRun: number;
};

/**
 * Weighted meal cost per day, with every recurring extra as an independent
 * layer on top. Day types are averaged by how often each kind of day happens;
 * extras are averaged over the full week regardless of day type.
 */
export function foodForecast(food: FoodConfig) {
  const weeks = food.dayTypes.reduce((s, t) => s + t.perWeek, 0);
  const foodPerDay = weeks
    ? food.dayTypes.reduce((s, t) => s + t.amount * t.perWeek, 0) / weeks
    : 0;

  const extras: ExtraForecast[] = food.extras.map((e) => {
    const perDay = (e.cost * e.perWeek) / 7;
    return {
      ...e,
      perDay,
      perMonth: perDay * food.daysPerMonth,
      perSkippedRun: (e.cost / 7) * food.daysPerMonth,
    };
  });
  const extrasPerDay = extras.reduce((s, e) => s + e.perDay, 0);

  return {
    foodPerDay,
    extras,
    extrasPerDay,
    perDay: foodPerDay + extrasPerDay,
    perMonth: (foodPerDay + extrasPerDay) * food.daysPerMonth,
    budgetPerMonth: food.dailyBudget * food.daysPerMonth,
  };
}

/**
 * What a line item costs the household, as opposed to its face value. An
 * 'each' item is paid in full by both of them, so a 500 keycard removes 1,000
 * from the household. Summing raw amounts instead is what made the Ledger's
 * move-in subtotal disagree with the engine by exactly one keycard.
 */
export function householdCost(item: LineItem, payer: Payer = item.payer): number {
  const s = applyPayer(item.amount, payer);
  return s.her + s.him;
}

export type Split = { her: number; him: number };

const ZERO: Split = { her: 0, him: 0 };

function add(a: Split, b: Split): Split {
  return { her: a.her + b.her, him: a.him + b.him };
}

/**
 * How a single charge lands on the two of them. 'each' is a per-person cost:
 * both pay the full amount, it is not halved.
 */
export function applyPayer(amount: number, payer: Payer): Split {
  switch (payer) {
    case 'her':
      return { her: amount, him: 0 };
    case 'him':
      return { her: 0, him: amount };
    case 'split':
      return { her: amount / 2, him: amount / 2 };
    case 'each':
      return { her: amount, him: amount };
  }
}

/**
 * Where a phase sits, as month indices from the plan's own start.
 *
 * A phase names the month it begins rather than being assumed to follow the one
 * before, so moving one does not shunt the rest along. `startMonth` is needed to
 * turn a calendar month into an index; without it the caller is working in a
 * different coordinate system from the line items.
 */
export function phaseRange(startMonth: string, phase: Phase): { from: number; to: number } {
  const [sy, sm] = startMonth.split('-').map(Number);
  const [py, pm] = phase.from.split('-').map(Number);
  const from = (py - sy) * 12 + (pm - sm);
  return { from, to: from + phase.months - 1 };
}

/**
 * The phase covering a month, or null. Phases may leave gaps — a month nothing
 * covers is simply not part of the plan — and where two overlap the earlier one
 * in the list wins, so the result is always defined.
 */
export function phaseOf(phases: Phase[], month: number, startMonth = '1970-01'): Phase | null {
  for (const p of phases) {
    const r = phaseRange(startMonth, p);
    if (month >= r.from && month <= r.to) return p;
  }
  return null;
}

/** How far the plan reaches: the end of its furthest phase. */
export function totalMonths(phases: Phase[], startMonth = '1970-01'): number {
  let end = 0;
  for (const p of phases) end = Math.max(end, phaseRange(startMonth, p).to + 1);
  return Math.max(0, end);
}

function isActive(item: LineItem, month: number): boolean {
  return item.cadence === 'onetime'
    ? month === item.startMonth
    : month >= item.startMonth;
}

/**
 * Restrict a plan calculation to one stretch of months. Without this the only
 * available answer is "across the whole timeline", which cannot be broken down
 * per phase or expressed per month.
 */
export type Window = { from: number; to: number };

export type Options = {
  /** Money owed to them, and anything else flagged uncertain. */
  includeUncertain: boolean;
  /** The pending tray: appliances, termination fee. */
  includePending: boolean;
  /**
   * Months to include, inclusive. Omitted means the whole plan. Money-in is
   * only counted for a whole-plan calculation: savings arrive once, so
   * attributing them to a slice would double-count them across phases.
   */
  window?: Window;
};

export type ItemBreakdown = {
  item: LineItem;
  occurrences: number;
  total: number;
  split: Split;
};

export type PlanResult = {
  months: number;
  /**
   * Items the plan never charges because their start month falls outside it.
   * Silently dropping them made a 9,999/month cost change the net by nothing.
   */
  orphaned: LineItem[];
  /** What the day types imply per month, against what has been budgeted. */
  foodVariance: { budgeted: number; forecast: number; gap: number };
  /** Per line item, across the whole timeline. */
  items: ItemBreakdown[];
  food: { total: number; split: Split; perMonth: number };
  costs: Split;
  income: Split;
  /** Savings and repayments counted into net. */
  moneyIn: Split;
  /** Held aside as backup, reported but not inside net. */
  backup: Split;
  net: Split;
  combined: number;
};

export function computePlan(config: Config, options: Options): PlanResult {
  const all = totalMonths(config.phases, config.startMonth);
  const from = options.window?.from ?? 0;
  const to = Math.min(options.window?.to ?? all - 1, all - 1);
  const months = Math.max(0, to - from + 1);
  const wholePlan = from === 0 && to === all - 1;
  const forecast = foodForecast(config.food);

  // Every line that appears in any scheme, plus the pending tray when asked
  // for. A line is identified across schemes by its id, so the same cost keeps
  // one breakdown even where its terms differ month to month.
  const seen = new Map<string, LineItem>();
  for (const scheme of config.schemes) {
    for (const item of scheme.items) {
      // Pending-ness is decided by which list a line is in, but honour the flag
      // too: a line that carries it should never be charged, wherever it sits.
      if (item.pending && !options.includePending) continue;
      if (!seen.has(item.id)) seen.set(item.id, item);
    }
  }
  if (options.includePending) {
    for (const item of config.pending) if (!seen.has(item.id)) seen.set(item.id, item);
  }
  const items = [...seen.values()];

  const breakdowns: ItemBreakdown[] = items.map((item) => {
    let occurrences = 0;
    let total = 0;
    let split = ZERO;

    for (let m = from; m <= to; m++) {
      const phase = phaseOf(config.phases, m, config.startMonth);
      if (!phase) continue;

      // The terms in force this month come from the phase's scheme. A line
      // absent from that scheme simply is not charged then, which is how a
      // cost can stop partway through the plan.
      const terms =
        schemeFor(config, phase).items.find((i) => i.id === item.id) ??
        (item.pending ? item : null);
      if (!terms || (terms.pending && !options.includePending) || !isActive(terms, m)) continue;

      occurrences += 1;
      total += terms.amount;
      split = add(split, applyPayer(terms.amount, terms.payer));
    }
    return { item, occurrences, total, split };
  });

  let costs = breakdowns.reduce((s, b) => add(s, b.split), ZERO);

  // Food is charged at the allowance, not the forecast — the same basis the
  // daily tracker and the month close use, so all three agree on what a month
  // of food costs. The forecast is reported separately as a variance: if the
  // day types imply more than the allowance, that is worth seeing, not worth
  // quietly baking into the plan.
  //
  // Each month is charged for the days it actually covers, so a mid-month
  // move-in is not billed for a fortnight nobody was living there.
  let foodTotal = 0;
  let foodSplit = ZERO;
  let foodBudgetedPerMonth = 0;
  for (let m = from; m <= to; m++) {
    const phase = phaseOf(config.phases, m, config.startMonth);
    if (!phase) continue;
    const cal = monthOfIndex(config.startMonth, m);
    const monthFood = config.food.dailyBudget * daysCoveredInMonth(config.startDate, cal);
    foodTotal += monthFood;
    foodBudgetedPerMonth = config.food.dailyBudget * config.food.daysPerMonth;
    foodSplit = add(foodSplit, applyPayer(monthFood, phase.foodPayer));
  }
  costs = add(costs, foodSplit);

  // Income accrues per month at the rate of whichever phase that month is in.
  let income = ZERO;
  for (let m = from; m <= to; m++) {
    const phase = phaseOf(config.phases, m, config.startMonth);
    if (!phase) continue;
    income = add(income, incomeOf(phase));
  }

  let moneyIn = ZERO;
  let backup = ZERO;
  // Savings and repayments arrive once, so they belong to the plan as a whole.
  // Counting them inside a phase would credit the same peso to every phase.
  for (const m of wholePlan ? config.moneyIn : []) {
    if (m.uncertain && !options.includeUncertain) continue;
    const target = m.backup ? 'backup' : 'moneyIn';
    const entry: Split = m.owner === 'her' ? { her: m.amount, him: 0 } : { her: 0, him: m.amount };
    if (target === 'backup') backup = add(backup, entry);
    else moneyIn = add(moneyIn, entry);
  }

  const net: Split = {
    her: income.her + moneyIn.her - costs.her,
    him: income.him + moneyIn.him - costs.him,
  };

  return {
    months,
    orphaned: wholePlan
      ? items.filter((i) => !breakdowns.find((b) => b.item.id === i.id)?.occurrences)
      : [],
    foodVariance: {
      budgeted: foodBudgetedPerMonth,
      forecast: forecast.perMonth,
      gap: forecast.perMonth - foodBudgetedPerMonth,
    },
    items: breakdowns,
    food: { total: foodTotal, split: foodSplit, perMonth: forecast.perMonth },
    costs,
    income,
    moneyIn,
    backup,
    net,
    combined: net.her + net.him,
  };
}
