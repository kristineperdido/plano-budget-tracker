import type { Config, FoodConfig, LineItem, Payer, Phase } from './config';

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

/** Months are laid end to end; phase p owns a contiguous run of them. */
export function phaseOf(phases: Phase[], month: number): Phase | null {
  let offset = 0;
  for (const p of phases) {
    if (month >= offset && month < offset + p.months) return p;
    offset += p.months;
  }
  return null;
}

export function totalMonths(phases: Phase[]): number {
  return phases.reduce((s, p) => s + p.months, 0);
}

function isActive(item: LineItem, month: number): boolean {
  return item.cadence === 'onetime'
    ? month === item.startMonth
    : month >= item.startMonth;
}

export type Options = {
  /** Brother's repayment and anything else flagged uncertain. */
  includeUncertain: boolean;
  /** The pending tray: appliances, termination fee. */
  includePending: boolean;
};

export type ItemBreakdown = {
  item: LineItem;
  occurrences: number;
  total: number;
  split: Split;
};

export type PlanResult = {
  months: number;
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
  const months = totalMonths(config.phases);
  const forecast = foodForecast(config.food);

  const items = config.items.filter((i) => (i.pending ? options.includePending : true));

  const breakdowns: ItemBreakdown[] = items.map((item) => {
    let occurrences = 0;
    let total = 0;
    let split = ZERO;

    for (let m = 0; m < months; m++) {
      if (!isActive(item, m)) continue;
      const phase = phaseOf(config.phases, m);
      if (!phase) continue;
      // A phase may reassign who pays without changing the item itself.
      const payer = phase.payers[item.id] ?? item.payer;
      occurrences += 1;
      total += item.amount;
      split = add(split, applyPayer(item.amount, payer));
    }
    return { item, occurrences, total, split };
  });

  let costs = breakdowns.reduce((s, b) => add(s, b.split), ZERO);

  // Food is a derived monthly line, charged per the phase in force that month.
  let foodTotal = 0;
  let foodSplit = ZERO;
  for (let m = 0; m < months; m++) {
    const phase = phaseOf(config.phases, m);
    if (!phase) continue;
    foodTotal += forecast.perMonth;
    foodSplit = add(foodSplit, applyPayer(forecast.perMonth, phase.foodPayer));
  }
  costs = add(costs, foodSplit);

  // Income accrues per month at the rate of whichever phase that month is in.
  let income = ZERO;
  for (let m = 0; m < months; m++) {
    const phase = phaseOf(config.phases, m);
    if (!phase) continue;
    income = add(income, {
      her: phase.income.her + phase.income.herSideHustle,
      him: phase.income.him,
    });
  }

  let moneyIn = ZERO;
  let backup = ZERO;
  for (const m of config.moneyIn) {
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
