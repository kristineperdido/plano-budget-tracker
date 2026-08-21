'use client';

import { supabase } from './supabase';

/** What a bill actually came to in a given month. */
export type BillPayment = {
  id: string;
  item_id: string;
  for_month: string; // YYYY-MM
  amount: number;
  paid_on: string;
  note: string | null;
  person: string | null;
};

type Row = Omit<BillPayment, 'amount'> & { amount: number | string };

const COLS = 'id, item_id, for_month, amount, paid_on, note, person';

export async function fetchBills(fromMonth?: string): Promise<BillPayment[]> {
  let q = supabase.from('bill_payments').select(COLS);
  if (fromMonth) q = q.gte('for_month', fromMonth);
  const { data, error } = await q.order('for_month', { ascending: false });

  if (error) throw new Error(error.message);
  return (data as Row[]).map((r) => ({ ...r, amount: Number(r.amount) }));
}

/**
 * Record what a bill came to. One row per bill per month, so recording it again
 * is a correction rather than a second charge.
 */
export async function recordBill(input: {
  item_id: string;
  for_month: string;
  amount: number;
  note?: string | null;
}): Promise<BillPayment> {
  const { data, error } = await supabase
    .from('bill_payments')
    .upsert(
      {
        item_id: input.item_id,
        for_month: input.for_month,
        amount: input.amount,
        note: input.note?.trim() || null,
      },
      { onConflict: 'item_id,for_month' },
    )
    .select(COLS)
    .single();

  if (error) throw new Error(error.message);
  const row = data as Row;
  return { ...row, amount: Number(row.amount) };
}

export async function deleteBill(id: string): Promise<void> {
  const { error } = await supabase.from('bill_payments').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
