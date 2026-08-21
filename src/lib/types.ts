/**
 * A category is just a string id resolved against `config.food.categories`.
 * It is deliberately not a closed union: categories are edited in Settings,
 * and the database stores plain text with no CHECK constraint, so adding one
 * needs neither a deploy nor a migration.
 */
export type Category = string;

/**
 * How a purchase is settled between the two of them. Opt-in: most entries are
 * just spending and carry no share at all.
 *
 *   null      whoever logged it absorbs the cost
 *   'half'    the other person owes half
 *   'fixed'   the other person owes exactly `owed_amount`
 */
export type Share = 'half' | 'fixed' | null;

export type FoodEntry = {
  id: string;
  spent_on: string; // YYYY-MM-DD, Manila calendar day
  category: Category;
  amount: number;
  note: string | null;
  /** Email of whoever logged it; null for rows predating attribution. */
  person: string | null;
  share: Share;
  /** Only ever set when `share` is 'fixed'; the database enforces that. */
  owed_amount: number | null;
  /** Set once the debt on this entry has been squared up. */
  settled_at: string | null;
  /**
   * Paid out of the eat-out pot rather than out of the day's limit. The pot is
   * built from days that came in under budget, so a purchase drawn from it must
   * not also count against today — that would charge the same peso twice.
   */
  from_pot: boolean;
  created_at: string;
};

/** A row as it comes off PostgREST, before coercion. Numerics arrive as text. */
export type FoodEntryRow = Omit<FoodEntry, 'amount' | 'owed_amount'> & {
  amount: number | string;
  owed_amount: number | string | null;
};

export function coerceEntry(row: FoodEntryRow): FoodEntry {
  return {
    ...row,
    amount: Number(row.amount),
    owed_amount: row.owed_amount === null ? null : Number(row.owed_amount),
  };
}

/**
 * What the other person owes on this entry. Zero for the ordinary case, so
 * callers can sum without branching.
 */
export function owedOn(entry: FoodEntry): number {
  if (entry.settled_at) return 0;
  if (entry.share === 'half') return entry.amount / 2;
  if (entry.share === 'fixed') return entry.owed_amount ?? 0;
  return 0;
}

/** A shared entry that has not yet been squared up. */
export function isOutstanding(entry: FoodEntry): boolean {
  return entry.share !== null && entry.settled_at === null;
}
