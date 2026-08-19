'use client';

import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    'Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY. Copy .env.example to .env.local.',
  );
}

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // Magic links land back on the app with the session in the URL.
    detectSessionInUrl: true,
    flowType: 'pkce',
  },
});

/**
 * Whether the signed-in address is on the allowlist. Being able to sign up is
 * deliberately not the same as being able to see anything — the RLS policies
 * gate on this too, this call just lets the UI say so plainly.
 */
export async function isMember(): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_member');
  if (error) return false;
  return data === true;
}
