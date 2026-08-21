'use client';

import { supabase } from './supabase';

/**
 * Days someone explicitly said nothing was spent on. Only these — and days that
 * actually have entries — are allowed to sweep into the side pot.
 */
export async function fetchNoSpendDays(from: string, to: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('no_spend_days')
    .select('day')
    .gte('day', from)
    .lte('day', to);

  if (error) throw new Error(error.message);
  return (data as { day: string }[]).map((r) => r.day);
}

export async function markNoSpend(day: string): Promise<void> {
  // `person` is filled by the database from the signed-in address.
  const { error } = await supabase.from('no_spend_days').insert({ day });
  if (error) throw new Error(error.message);
}

export async function unmarkNoSpend(day: string): Promise<void> {
  const { error } = await supabase.from('no_spend_days').delete().eq('day', day);
  if (error) throw new Error(error.message);
}
