'use client';

import { supabase } from './supabase';
import { coerceEntry, type Category, type FoodEntry, type FoodEntryRow } from './types';

/**
 * Entries from `from` through `to` inclusive, oldest-last. The Today screen
 * pulls a window wide enough to cover both the current month (for the buffer)
 * and the recent-days ledger.
 */
export async function fetchEntries(from: string, to: string): Promise<FoodEntry[]> {
  const { data, error } = await supabase
    .from('food_entries')
    .select('id, spent_on, category, amount, note, person, created_at')
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
}): Promise<FoodEntry> {
  const { data, error } = await supabase
    .from('food_entries')
    .insert({
      spent_on: input.spent_on,
      category: input.category,
      amount: input.amount,
      note: input.note?.trim() || null,
    })
    .select('id, spent_on, category, amount, note, person, created_at')
    .single();

  if (error) throw new Error(error.message);
  return coerceEntry(data as FoodEntryRow);
}

export async function deleteEntry(id: string): Promise<void> {
  const { error } = await supabase.from('food_entries').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
