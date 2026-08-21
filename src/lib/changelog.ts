'use client';

import { supabase } from './supabase';

export type Change = {
  id: string;
  note: string;
  created_at: string;
  /** Email of whoever made the change; null for rows predating attribution. */
  person: string | null;
};

/** Newest first. The log is append-only, so this only ever grows. */
export async function fetchChanges(limit = 100): Promise<Change[]> {
  const { data, error } = await supabase
    .from('budget_changelog')
    .select('id, note, created_at, person')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return data as Change[];
}
