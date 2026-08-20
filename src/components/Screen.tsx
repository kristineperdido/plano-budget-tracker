'use client';

import { supabase } from '@/lib/supabase';

/** Shared page chrome: title, sign-out, consistent padding above the tab bar. */
export function Screen({
  title,
  children,
  action,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <main className="mx-auto min-h-dvh max-w-md pb-28">
      <header className="flex items-baseline justify-between px-5 pt-6">
        <h1 className="serif text-[1.15rem] tracking-wide">Plano</h1>
        <div className="flex items-baseline gap-3">
          <span className="stamp">{title}</span>
          {action}
          <button
            type="button"
            onClick={() => void supabase.auth.signOut()}
            className="tint-muted text-[0.7rem] underline"
          >
            Sign out
          </button>
        </div>
      </header>
      {children}
    </main>
  );
}
