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
    // Implicit, not PKCE. PKCE keeps the code_verifier in the localStorage of
    // the browser that *requested* the link, but a magic link is typically
    // opened from a mail app, which hands it to a different browser (or an
    // in-app webview with its own storage). The verifier is missing there, the
    // exchange cannot happen, and the user silently lands back on sign-in.
    // Implicit carries the session in the URL fragment, so it works wherever
    // the link is opened. The trade-off is tokens transiting the fragment;
    // acceptable here, and supabase-js strips them from the URL immediately.
    flowType: 'implicit',
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

/**
 * Supabase reports a failed magic link by sending the browser back with error
 * params — in the fragment for the implicit flow, in the query string for some
 * server-side redirects. Without reading these, a rejected or already-used link
 * is indistinguishable from never having signed in: the app just shows the
 * email form again, which reads as a loop.
 */
export function readAuthErrorFromUrl(): string | null {
  if (typeof window === 'undefined') return null;

  const sources = [
    new URLSearchParams(window.location.hash.replace(/^#/, '')),
    new URLSearchParams(window.location.search),
  ];

  for (const params of sources) {
    const code = params.get('error') ?? params.get('error_code');
    if (!code) continue;
    const description = params.get('error_description');
    return (description ?? code).replace(/\+/g, ' ');
  }
  return null;
}
