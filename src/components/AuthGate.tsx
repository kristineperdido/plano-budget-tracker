'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { isMember, readAuthErrorFromUrl, supabase } from '@/lib/supabase';

type Status = 'loading' | 'signed-out' | 'not-member' | 'ready';

const SessionContext = createContext<Session | null>(null);

/** The signed-in session. Only ever called from inside the gate. */
export function useSession(): Session {
  const s = useContext(SessionContext);
  if (!s) throw new Error('useSession must be used inside AuthGate');
  return s;
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [checked, setChecked] = useState(false);
  // Read before supabase-js scrubs the fragment on init.
  const [linkError] = useState(readAuthErrorFromUrl);
  // Tagged with the user it was resolved for, so a stale answer from a previous
  // account can never be read as the current one's.
  const [memberFor, setMemberFor] = useState<{ userId: string; ok: boolean } | null>(null);

  // Resolve the existing session once, then follow auth changes.
  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setSession(data.session);
      setChecked(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setChecked(true);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Signing in is not the same as being on the allowlist; ask the database.
  const userId = session?.user.id;
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    isMember().then((ok) => {
      if (!cancelled) setMemberFor({ userId, ok });
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const member = userId && memberFor?.userId === userId ? memberFor.ok : null;

  const status: Status = !checked
    ? 'loading'
    : !session
      ? 'signed-out'
      : member === null
        ? 'loading'
        : member
          ? 'ready'
          : 'not-member';

  if (status === 'loading') {
    return (
      <p className="tint-muted serif px-5 py-20 text-center text-[0.9rem] italic">
        Opening the ledger…
      </p>
    );
  }

  if (status === 'signed-out') return <SignIn linkError={linkError} />;

  if (status === 'not-member') {
    return (
      <div className="mx-auto max-w-md px-5 py-20 text-center">
        <h1 className="serif text-[1.15rem]">Not on this ledger</h1>
        <p className="tint-muted mt-3 text-[0.85rem]">
          {session?.user.email} isn&apos;t one of the accounts on this budget.
        </p>
        <button
          type="button"
          onClick={() => void supabase.auth.signOut()}
          className="mt-6 rounded-[2px] border px-4 py-2 text-[0.85rem]"
          style={{ borderColor: 'var(--rule)' }}
        >
          Sign out
        </button>
      </div>
    );
  }

  return (
    <SessionContext.Provider value={session as Session}>{children}</SessionContext.Provider>
  );
}

function SignIn({ linkError }: { linkError: string | null }) {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !email.trim()) return;
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) setError(error.message);
    else setSent(true);
    setBusy(false);
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6">
      <h1 className="serif text-center text-[1.6rem]">Plano</h1>
      <p className="tint-muted serif mt-1 text-center text-[0.85rem] italic">
        A running tally, for the two of us.
      </p>

      {linkError && !sent && (
        <p
          className="tint-brick sheet mt-6 px-4 py-3 text-[0.82rem]"
          role="alert"
        >
          That sign-in link didn&apos;t work: {linkError}. Links are single-use
          and expire quickly — request a fresh one below.
        </p>
      )}

      {sent ? (
        <div className="sheet mt-8 px-5 py-6 text-center">
          <p className="text-[0.9rem]">Check your email.</p>
          <p className="tint-muted mt-2 text-[0.82rem]">
            Sign-in link sent to {email}. Open it on this device.
          </p>
          <button
            type="button"
            onClick={() => setSent(false)}
            className="tint-muted mt-4 text-[0.78rem] underline"
          >
            Use a different address
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="sheet mt-8 px-5 py-6">
          <label className="block">
            <span className="tint-muted text-[0.7rem] uppercase tracking-[0.18em]">
              Email
            </span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              placeholder="you@example.com"
              className="mt-1 w-full border-b bg-transparent pb-1 text-[0.95rem] outline-none"
              style={{ borderColor: 'var(--rule)' }}
            />
          </label>

          {error && (
            <p className="tint-brick mt-3 text-[0.8rem]" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="mt-5 w-full rounded-[2px] py-3 text-[0.9rem] disabled:opacity-40"
            style={{ background: 'var(--ink)', color: 'var(--paper-light)' }}
          >
            {busy ? 'Sending…' : 'Email me a link'}
          </button>
        </form>
      )}
    </main>
  );
}
