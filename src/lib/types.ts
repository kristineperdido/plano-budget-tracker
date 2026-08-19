export const CATEGORIES = ['groceries', 'eatout', 'coffee'] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABEL: Record<Category, string> = {
  groceries: 'Groceries',
  eatout: 'Eat out',
  coffee: 'Coffee',
};

export type FoodEntry = {
  id: string;
  spent_on: string; // YYYY-MM-DD, Manila calendar day
  category: Category;
  amount: number;
  note: string | null;
  created_at: string;
};

/** A row as it comes off PostgREST, before coercion. */
export type FoodEntryRow = Omit<FoodEntry, 'amount'> & { amount: number | string };

export function coerceEntry(row: FoodEntryRow): FoodEntry {
  return { ...row, amount: Number(row.amount) };
}
