/**
 * A category is just a string id resolved against `config.food.categories`.
 * It is deliberately not a closed union: categories are edited in Settings,
 * and the database stores plain text with no CHECK constraint, so adding one
 * needs neither a deploy nor a migration.
 */
export type Category = string;

export type FoodEntry = {
  id: string;
  spent_on: string; // YYYY-MM-DD, Manila calendar day
  category: Category;
  amount: number;
  note: string | null;
  /** Email of whoever logged it; null for rows predating attribution. */
  person: string | null;
  created_at: string;
};

/** A row as it comes off PostgREST, before coercion. */
export type FoodEntryRow = Omit<FoodEntry, 'amount'> & { amount: number | string };

export function coerceEntry(row: FoodEntryRow): FoodEntry {
  return { ...row, amount: Number(row.amount) };
}
