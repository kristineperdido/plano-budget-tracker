'use client';

import { supabase } from './supabase';

/**
 * 'sweep'      a finished month's surplus, banked deliberately
 * 'drawdown'   a finished month that cost more than it had, covered from savings
 * 'deposit'    money put in from elsewhere
 * 'withdrawal' money taken back out
 *
 * Drawdowns and withdrawals are stored negative, so the balance is a plain sum.
 */
export type SavingsKind = 'sweep' | 'deposit' | 'withdrawal' | 'drawdown';

export type SavingsEntry = {
  id: string;
  banked_on: string;
  kind: SavingsKind;
  /** Negative for withdrawals, so the balance is a plain sum. */
  amount: number;
  /** The month a sweep closes out, as YYYY-MM. Null for anything else. */
  for_month: string | null;
  note: string | null;
  person: string | null;
  created_at: string;
};

type Row = Omit<SavingsEntry, 'amount'> & { amount: number | string };

export async function fetchSavings(): Promise<SavingsEntry[]> {
  const { data, error } = await supabase
    .from('savings_entries')
    .select('id, banked_on, kind, amount, for_month, note, person, created_at')
    .order('banked_on', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data as Row[]).map((r) => ({ ...r, amount: Number(r.amount) }));
}

export async function addSavings(input: {
  kind: SavingsKind;
  amount: number;
  for_month?: string | null;
  note?: string | null;
}): Promise<SavingsEntry> {
  const { data, error } = await supabase
    .from('savings_entries')
    // `person` is filled by the database from the signed-in address.
    .insert({
      kind: input.kind,
      // Withdrawals are stored negative; the caller passes a positive figure.
      amount:
        input.kind === 'withdrawal' || input.kind === 'drawdown'
          ? -Math.abs(input.amount)
          : Math.abs(input.amount),
      for_month: input.for_month ?? null,
      note: input.note?.trim() || null,
    })
    .select('id, banked_on, kind, amount, for_month, note, person, created_at')
    .single();

  if (error) throw new Error(error.message);
  const row = data as Row;
  return { ...row, amount: Number(row.amount) };
}

export async function deleteSavings(id: string): Promise<void> {
  const { error } = await supabase.from('savings_entries').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
