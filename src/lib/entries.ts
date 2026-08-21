'use client';

import { supabase } from './supabase';
import { coerceEntry, type Category, type FoodEntry, type FoodEntryRow, type Share } from './types';

const COLS =
  'id, spent_on, category, amount, note, person, share, owed_amount, settled_at, from_pot, created_at';

/**
 * Entries from `from` through `to` inclusive, oldest-last. The Today screen
 * pulls a window wide enough to cover both the current month (for the buffer)
 * and the recent-days ledger.
 */
export async function fetchEntries(from: string, to: string): Promise<FoodEntry[]> {
  const { data, error } = await supabase
    .from('food_entries')
    .select(COLS)
    .gte('spent_on', from)
    .lte('spent_on', to)
    .order('spent_on', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data as FoodEntryRow[]).map(coerceEntry);
}

export async function addEntry(input: {
  spent_on: string;
  category: Category;
  amount: number;
  note?: string;
  /** Opt-in settlement. Omitted means nobody owes anything on this entry. */
  share?: Share;
  owed_amount?: number | null;
  /** Draw this from the eat-out pot instead of today's limit. */
  from_pot?: boolean;
}): Promise<FoodEntry> {
  const { data, error } = await supabase
    .from('food_entries')
    .insert({
      spent_on: input.spent_on,
      category: input.category,
      amount: input.amount,
      note: input.note?.trim() || null,
      share: input.share ?? null,
      // The database rejects an owed amount that no share justifies, so only
      // send one when the share is actually 'fixed'.
      owed_amount: input.share === 'fixed' ? (input.owed_amount ?? 0) : null,
      from_pot: input.from_pot ?? false,
    })
    .select(COLS)
    .single();

  if (error) throw new Error(error.message);
  return coerceEntry(data as FoodEntryRow);
}

export async function deleteEntry(id: string): Promise<void> {
  const { error } = await supabase.from('food_entries').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/**
 * Square up every outstanding shared entry. Entries are marked rather than
 * removed, so what was actually spent stays on the record and only the balance
 * resets.
 */
export async function settleUp(): Promise<number> {
  const { data, error } = await supabase
    .from('food_entries')
    .update({ settled_at: new Date().toISOString() })
    .not('share', 'is', null)
    .is('settled_at', null)
    .select('id');

  if (error) throw new Error(error.message);
  return (data as { id: string }[]).length;
}
