/**
 * The whole plan lives in one jsonb blob in `budget_config`. Shapes here are
 * the contract between the database and every screen that reads it.
 */

export type Payer = 'her' | 'him' | 'split' | 'each';
export type Cadence = 'onetime' | 'monthly';

export const PAYER_LABEL: Record<Payer, string> = {
  her: 'Her',
  him: 'Him',
  split: '50/50',
  each: 'Each pays own',
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

export type DayType = { id: string; label: string; amount: number; perWeek: number };

export type FoodConfig = {
  dayTypes: DayType[];
  coffee: { cost: number; perWeek: number };
  daysPerMonth: number;
  dailyBudget: number;
};

export type Config = {
  version: 1;
  /** Month 0 of the timeline, as YYYY-MM. */
  startMonth: string;
  phases: Phase[];
  items: LineItem[];
  moneyIn: MoneyIn[];
  food: FoodConfig;
};

// --------------------------------------------------------------- defaults

export const DEFAULT_CONFIG: Config = {
  version: 1,
  startMonth: '2026-09',
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
      { id: 'tipid', label: 'Tipid',            amount: 160, perWeek: 2 },
      { id: 'mid',   label: 'Not-so-tipid',     amount: 450, perWeek: 3 },
      { id: 'lax',   label: 'Not tipid at all', amount: 780, perWeek: 2 },
    ],
    coffee: { cost: 130, perWeek: 3 },
    daysPerMonth: 30,
    dailyBudget: 500,
  },
};
