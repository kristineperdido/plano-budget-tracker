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
    return <p className="empty px-5 py-20 text-center">opening the ledger…</p>;
  }

  if (status === 'signed-out') return <SignIn linkError={linkError} />;

  if (status === 'not-member') {
    return (
      <div className="mx-auto max-w-md px-6 py-20 text-center">
        <h1 className="sign text-[19px]">Not on this ledger</h1>
        <p className="tint-muted mt-3 text-[13px]">
          {session?.user.email} isn&apos;t one of the accounts on this budget.
        </p>
        <button
          type="button"
          onClick={() => void supabase.auth.signOut()}
          className="btn btn--ghost mt-6"
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

/**
 * The one screen that inverts: dark ground, rolled shutter, and the form laid
 * on it as a slab of the same ruled paper the rest of the app is printed on.
 */
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
    <main
      className="flex min-h-dvh flex-col"
      style={{ background: 'var(--ink)', color: 'var(--paper)' }}
    >
      <div className="shutter h-[86px] w-full" aria-hidden />

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 pb-16">
        <h1
          className="sign text-center"
          style={{ fontSize: 54, lineHeight: 1, letterSpacing: '0.03em' }}
        >
          Plano
        </h1>
        <div className="tarp-stripe mt-3" aria-hidden />
        <p className="marker mt-3 text-center text-[21px]" style={{ color: 'var(--gold)' }}>
          a running tally, for the two of us
        </p>

        {linkError && !sent && (
          <p
            className="mt-6 border px-4 py-3 text-[12.5px]"
            style={{ borderColor: 'var(--brick)', color: '#e8a394' }}
            role="alert"
          >
            That sign-in link didn&apos;t work: {linkError}. Links are single-use and expire
            quickly — request a fresh one below.
          </p>
        )}

        {sent ? (
          <div
            className="paper mt-7 p-6 text-center"
            style={{ color: 'var(--ink)', boxShadow: '0 6px 0 0 rgb(0 0 0 / 0.35)' }}
          >
            <p className="sign text-[15px]">Check your email</p>
            <p className="tint-muted mt-2 text-[12.5px]">
              Sign-in link sent to <span className="num">{email}</span>.
            </p>
            <p className="empty mt-3">open it on this phone</p>
            <button
              type="button"
              onClick={() => setSent(false)}
              className="tint-muted mt-4 text-[12px] underline"
            >
              Use a different address
            </button>
          </div>
        ) : (
          <form
            onSubmit={submit}
            className="paper mt-7 p-6"
            style={{ color: 'var(--ink)', boxShadow: '0 6px 0 0 rgb(0 0 0 / 0.35)' }}
          >
            <label className="block">
              <span className="sign-label tint-teal">Email</span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                placeholder="you@example.com"
                className="field-text mt-1.5"
                style={{ textAlign: 'left' }}
              />
            </label>

            {error && (
              <p className="tint-brick mt-3 text-[12.5px]" role="alert">
                {error}
              </p>
            )}

            <button type="submit" disabled={busy} className="btn btn--primary mt-4">
              {busy ? 'Sending…' : 'Email me a link'}
            </button>

            <p className="empty mt-3 text-center text-[17px]">
              no passwords — and you have to be on the list
            </p>
          </form>
        )}
      </div>

      <p
        className="sign pb-8 text-center"
        style={{ fontSize: 10, letterSpacing: '0.2em', color: 'var(--charcoal)' }}
      >
        Manila · PHP
      </p>
    </main>
  );
}
