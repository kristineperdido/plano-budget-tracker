'use client';

import { supabase } from './supabase';

export type Member = { email: string; label: string | null };

export async function fetchMembers(): Promise<Member[]> {
  const { data, error } = await supabase.from('app_members').select('email, label');
  if (error) return [];
  return data as Member[];
}

/** "You" for your own entries, otherwise the roster label, else the local part. */
export function personLabel(
  person: string | null,
  me: string | undefined,
  members: Member[],
): string | null {
  if (!person) return null;
  if (me && person.toLowerCase() === me.toLowerCase()) return 'You';
  const match = members.find((m) => m.email.toLowerCase() === person.toLowerCase());
  return match?.label ?? person.split('@')[0];
}
