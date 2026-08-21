/**
 * The whole plan lives in one jsonb blob in `budget_config`. Shapes here are
 * the contract between the database and every screen that reads it.
 */

export type Payer = 'her' | 'him' | 'split' | 'each';
export type Cadence = 'onetime' | 'monthly';

/**
 * How each payer reads in the interface. Lowercase on purpose — these render in
 * marker as a jotted note, not as a heading.
 */
export const PAYER_LABEL: Record<Payer, string> = {
  her: 'tin',
  him: 'jhay',
  split: 'both',
  each: 'both',
};

/** The qualifier that sits beside the name, never on a row of its own. */
export const PAYER_NOTE: Partial<Record<Payer, string>> = {
  split: '50/50',
  each: 'each pays own',
};

/** Long form, for the payer picker where the shape mark is not enough. */
export const PAYER_DESCRIPTION: Record<Payer, string> = {
  her: 'tin pays',
  him: 'jhay pays',
  split: 'split 50/50',
  each: 'each pays their own',
};

export type LineItem = {
  id: string;
  label: string;
  amount: number;
  cadence: Cadence;
  /** Months since move-in. A one-time item lands on this month. */
  startMonth: number;
  /** Used when a phase does not override the payer. */
  payer: Payer;
  group: 'movein' | 'housing' | 'living' | 'personal';
  note?: string;
  /** Sits in the Pending tray and is excluded until confirmed. */
  pending?: boolean;
  /** Amount is a guess; shown as a range in the tray. */
  estimateLow?: number;
  estimateHigh?: number;
};

export type Phase = {
  id: string;
  label: string;
  months: number;
  /** Per month, for the duration of the phase. */
  income: { her: number; him: number; herSideHustle: number };
  /** Per-phase payer overrides, keyed by line-item id. */
  payers: Record<string, Payer>;
  /** Who carries the food bill during this phase. */
  foodPayer: Payer;
};

export type MoneyIn = {
  id: string;
  label: string;
  amount: number;
  owner: 'her' | 'him';
  /** Excluded unless the "include uncertain money" toggle is on. */
  uncertain?: boolean;
  /** Held as backup and reported separately rather than inside net. */
  backup?: boolean;
  note?: string;
};

/** A kind of day, priced. The plan is a weighted average over these. */
export type DayType = { id: string; label: string; amount: number; perWeek: number };

/**
 * A recurring add-on that rides on top of whichever kind of day it is —
 * coffee runs, a gym day, anything with a per-occurrence cost and a weekly
 * rhythm. Independent of day type on purpose: a coffee run is a coffee run
 * whether the day was lean or loose.
 */
export type Extra = { id: string; label: string; cost: number; perWeek: number };

/**
 * What a logged entry can be filed under. Free-form; edited in Settings.
 * Removing one archives it rather than deleting it, so entries already filed
 * against it keep showing the name they were filed under instead of falling
 * back to the raw slug.
 */
export type CategoryDef = { id: string; label: string; archived?: boolean };

export type FoodConfig = {
  dayTypes: DayType[];
  extras: Extra[];
  categories: CategoryDef[];
  daysPerMonth: number;
  dailyBudget: number;
};

/** Shapes this config has had before, kept only so `migrate` can read them. */
export type LegacyFoodConfig = FoodConfig & {
  /** Superseded by `extras`; a lone hard-coded coffee layer. */
  coffee?: { cost: number; perWeek: number };
};

/** The savings target the couple are working toward. */
export type SavingsConfig = {
  goalLabel: string;
  /** Zero means no goal set; the balance is still tracked. */
  goalAmount: number;
};

/**
 * The side pot that unspent days flow into. Named, because what it is for is
 * the whole point of it — and renameable, because that will change.
 */
export type PotConfig = {
  label: string;
};

export type SettlementConfig = {
  /**
   * What the log sheet offers by default. Settlement is opt-in, so this is
   * 'none' unless the couple decide most of their spending is shared.
   */
  defaultShare: 'none' | 'half';
};

export type Config = {
  version: 1;
  /** Month 0 of the timeline, as YYYY-MM. */
  startMonth: string;
  /**
   * The first day tracking counts from — the day you actually start sharing a
   * home, which is rarely the 1st. Before it the daily envelope does not run at
   * all, and the month it falls in is pro-rated to the days that remain: move
   * in on the 15th and September's pool is dailyBudget x 16, not x 30.
   *
   * Without this the replay treats every earlier day of the month as a frugal
   * day and sweeps a full allowance into the pot for each one.
   */
  startDate: string;
  phases: Phase[];
  items: LineItem[];
  moneyIn: MoneyIn[];
  food: FoodConfig;
  savings: SavingsConfig;
  settlement: SettlementConfig;
  pot: PotConfig;
};

// --------------------------------------------------------------- defaults

export const DEFAULT_CONFIG: Config = {
  version: 1,
  startMonth: '2026-09',
  startDate: '2026-09-15',
  items: [
    { id: 'deposit',   label: 'Security deposit', amount: 23000, cadence: 'onetime', startMonth: 0, payer: 'her',   group: 'movein', note: "2 months' rent" },
    { id: 'advance',   label: 'Advance',          amount: 11500, cadence: 'onetime', startMonth: 0, payer: 'her',   group: 'movein', note: 'prepays Month 0 rent' },
    { id: 'keycard',   label: 'Keycard',          amount: 500,   cadence: 'onetime', startMonth: 0, payer: 'each',  group: 'movein', note: '₱500 each, not split' },
    { id: 'petfee',    label: 'Pet fee',          amount: 3000,  cadence: 'onetime', startMonth: 0, payer: 'split', group: 'movein', note: 'annual, per lease' },
    { id: 'interviews',label: 'Interview trips',  amount: 583,   cadence: 'onetime', startMonth: 0, payer: 'her',   group: 'personal', note: '3 trips x (₱70 fare + lunch)' },

    { id: 'rent',      label: 'Rent',        amount: 11500, cadence: 'monthly', startMonth: 1, payer: 'him', group: 'housing', note: 'Month 0 covered by the advance' },
    { id: 'electric',  label: 'Electric',    amount: 2500,  cadence: 'monthly', startMonth: 1, payer: 'him', group: 'housing', note: 'first bill covers Sept–Oct' },
    { id: 'water',     label: 'Water',       amount: 500,   cadence: 'monthly', startMonth: 1, payer: 'him', group: 'housing', note: 'same billing lag' },
    { id: 'wifi',      label: 'WiFi',        amount: 1000,  cadence: 'monthly', startMonth: 0, payer: 'him', group: 'housing', note: 'prepaid' },
    { id: 'laundry',   label: 'Laundry',     amount: 640,   cadence: 'monthly', startMonth: 0, payer: 'him', group: 'living',  note: '₱150–170/week' },
    { id: 'maintenance', label: 'Maintenance', amount: 500, cadence: 'monthly', startMonth: 0, payer: 'him', group: 'housing' },
    { id: 'mama',      label: "Mama's bills", amount: 2300, cadence: 'monthly', startMonth: 0, payer: 'him', group: 'personal', note: '₱1,500 allowance + ₱800 WiFi' },
    { id: 'frosty',    label: 'Frosty',      amount: 1069,  cadence: 'monthly', startMonth: 0, payer: 'split', group: 'living', note: 'dry ₱777 + wet ₱206 + litter ₱86' },
    { id: 'drinking',  label: 'Drinking water', amount: 86, cadence: 'monthly', startMonth: 0, payer: 'split', group: 'living', note: '~2 weeks per gallon' },

    // Pending tray — excluded from the math until confirmed.
    { id: 'termination', label: 'Early termination fee', amount: 0, cadence: 'onetime', startMonth: 0, payer: 'split', group: 'movein', pending: true, note: 'unknown — check the contract before signing' },
    { id: 'appliances',  label: 'Appliances', amount: 5000, cadence: 'onetime', startMonth: 0, payer: 'split', group: 'movein', pending: true, estimateLow: 3000, estimateHigh: 7000, note: 'fridge, wardrobe' },
  ],
  phases: [
    {
      id: 'gap',
      label: 'Between jobs',
      months: 2,
      income: { her: 0, him: 27400, herSideHustle: 0 },
      payers: {},
      foodPayer: 'split',
    },
  ],
  moneyIn: [
    { id: 'her-savings', label: 'Her savings',    amount: 40000, owner: 'her' },
    { id: 'brother',     label: "Brother's repayment", amount: 10000, owner: 'her', uncertain: true, note: '₱20,000 owed; ₱10,000 realistic in the window' },
    { id: 'his-savings', label: 'His savings',    amount: 10819, owner: 'him', backup: true, note: 'Aug 25 – Sep 25 cutoff, not earmarked' },
  ],
  food: {
    dayTypes: [
      { id: 'lean',   label: 'Lean',   amount: 160, perWeek: 2 },
      { id: 'normal', label: 'Normal', amount: 450, perWeek: 3 },
      { id: 'loose',  label: 'Loose',  amount: 780, perWeek: 2 },
    ],
    extras: [{ id: 'coffee', label: 'Coffee', cost: 130, perWeek: 3 }],
    categories: [
      // `meals` is what a whole-day log lands under; `extras` catches a
      // recurring extra that has no category of its own.
      { id: 'meals',     label: 'Meals' },
      { id: 'groceries', label: 'Groceries' },
      { id: 'eatout',    label: 'Eat out' },
      { id: 'coffee',    label: 'Coffee' },
      { id: 'delivery',  label: 'Delivery' },
      { id: 'snacks',    label: 'Snacks' },
      { id: 'extras',    label: 'Extras' },
    ],
    daysPerMonth: 30,
    dailyBudget: 500,
  },
  savings: { goalLabel: 'Emergency fund', goalAmount: 50000 },
  settlement: { defaultShare: 'none' },
  pot: { label: 'For eat out' },
};

/**
 * A pending item nobody has been able to put a figure on at all. Its worst case
 * is not zero, it is unknown — and reporting zero exposure for it is worse than
 * reporting none, because it reads as "no risk here".
 */
export function isUnbounded(item: LineItem): boolean {
  return Boolean(item.pending) && item.amount === 0 && item.estimateHigh === undefined;
}

/** A category id that is no longer configured still has to render. */
export function categoryLabel(id: string, categories: CategoryDef[]): string {
  return categories.find((c) => c.id === id)?.label ?? id;
}

/**
 * Coffee used to be a single hard-coded layer on top of the day types; it is
 * now one recurring extra among however many the couple keep. A config written
 * before that change still has `coffee` and no `extras`, so lift it across
 * rather than silently dropping the cost out of the forecast.
 */
export function migrateFood(stored: LegacyFoodConfig | undefined) {
  const food = { ...DEFAULT_CONFIG.food, ...stored };

  if (!stored?.extras?.length && stored?.coffee) {
    food.extras = [{ id: 'coffee', label: 'Coffee', ...stored.coffee }];
  }
  if (!stored?.categories?.length) {
    food.categories = DEFAULT_CONFIG.food.categories;
  }

  // `coffee` is not part of the current shape; drop it so it stops round-tripping.
  delete (food as LegacyFoodConfig).coffee;
  return food;
}
