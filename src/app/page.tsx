'use client';

import { useEffect, useMemo, useState } from 'react';
import { AuthGate } from '@/components/AuthGate';
import { BufferHeadline } from '@/components/BufferHeadline';
import { EntryList } from '@/components/EntryList';
import { LogSheet } from '@/components/LogSheet';
import { MonthProgress } from '@/components/MonthProgress';
import { RecentDays } from '@/components/RecentDays';
import { addDays, monthStart, todayISO } from '@/lib/date';
import { addEntry, deleteEntry, fetchEntries } from '@/lib/entries';
import { byDay, computeToday } from '@/lib/model';
import { supabase } from '@/lib/supabase';
import type { FoodEntry } from '@/lib/types';

/** Days of history shown under the fold. */
const RECENT_DAYS = 14;

export default function Page() {
  return <AuthGate>{() => <TodayScreen />}</AuthGate>;
}

function TodayScreen() {
  const [today, setToday] = useState(todayISO);
  const [entries, setEntries] = useState<FoodEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  // Bumped by the realtime channel to re-run the fetch effect.
  const [reloadKey, setReloadKey] = useState(0);

  // The window has to cover the whole current month (the buffer is
  // month-to-date) as well as the recent-days list, which can reach back past
  // the 1st early in a month.
  const from = useMemo(() => {
    const m = monthStart(today);
    const r = addDays(today, -(RECENT_DAYS - 1));
    return m < r ? m : r;
  }, [today]);

  // Fetch on mount and whenever the window moves. State is set from the
  // promise continuation, and a cancel flag keeps a stale response from
  // overwriting a newer one.
  useEffect(() => {
    let cancelled = false;
    fetchEntries(from, today).then(
      (rows) => {
        if (cancelled) return;
        setEntries(rows);
        setError(null);
        setLoading(false);
      },
      (e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Could not reach Supabase.');
        setLoading(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [from, today, reloadKey]);

  // Both partners log from their own phones, so mirror changes live.
  useEffect(() => {
    const channel = supabase
      .channel('food_entries_today')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'food_entries' },
        () => setReloadKey((k) => k + 1),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  // The app may sit open across midnight; roll the Manila day over in place.
  useEffect(() => {
    const id = setInterval(() => {
      const now = todayISO();
      setToday((prev) => (prev === now ? prev : now));
    }, 30_000);
    return () => clearInterval(id);
  }, []);

  const stats = useMemo(() => computeToday(entries, today), [entries, today]);
  const todaysEntries = useMemo(
    () => entries.filter((e) => e.spent_on === today),
    [entries, today],
  );
  const recent = useMemo(
    () => byDay(entries.filter((e) => e.spent_on !== today)).slice(0, RECENT_DAYS),
    [entries, today],
  );

  async function handleSave(v: Parameters<typeof addEntry>[0]) {
    const saved = await addEntry(v);
    setEntries((prev) => (prev.some((e) => e.id === saved.id) ? prev : [saved, ...prev]));
  }

  async function handleDelete(id: string) {
    const snapshot = entries;
    setPendingDelete(id);
    setEntries((prev) => prev.filter((e) => e.id !== id)); // optimistic
    try {
      await deleteEntry(id);
    } catch (e) {
      setEntries(snapshot); // put it back
      setError(e instanceof Error ? e.message : 'Could not delete.');
    } finally {
      setPendingDelete(null);
    }
  }

  return (
    <main className="mx-auto min-h-dvh max-w-md pb-28">
      <header className="flex items-baseline justify-between px-5 pt-6">
        <h1 className="serif text-[1.15rem] tracking-wide">Plano</h1>
        <div className="flex items-baseline gap-3">
          <span className="tint-muted text-[0.7rem] uppercase tracking-[0.18em]">
            Today
          </span>
          <button
            type="button"
            onClick={() => void supabase.auth.signOut()}
            className="tint-muted text-[0.7rem] underline"
          >
            Sign out
          </button>
        </div>
      </header>

      {error && (
        <p
          className="tint-brick mx-5 mt-4 border px-3 py-2 text-[0.8rem]"
          style={{ borderColor: 'var(--brick)' }}
          role="alert"
        >
          {error}
        </p>
      )}

      {loading ? (
        <p className="tint-muted serif px-5 py-16 text-center text-[0.9rem] italic">
          Reading the ledger…
        </p>
      ) : (
        <>
          <BufferHeadline s={stats} />

          <div className="mx-5 perf" aria-hidden />

          <MonthProgress s={stats} today={today} />

          <section className="px-5 pb-6">
            <h2 className="tint-muted mb-1 text-[0.7rem] uppercase tracking-[0.18em]">
              Today
            </h2>
            <EntryList
              entries={todaysEntries}
              onDelete={handleDelete}
              pendingDelete={pendingDelete}
            />
            <div className="rule-dashed mt-2 pt-2">
              <div className="leader">
                <span className="text-[0.85rem]">Total</span>
                <span className="leader-fill" aria-hidden />
                <span className="num text-[0.85rem]">
                  ₱{stats.spentToday.toFixed(2)}
                </span>
              </div>
            </div>
          </section>

          <RecentDays days={recent} today={today} />
        </>
      )}

      <button
        type="button"
        onClick={() => setSheetOpen(true)}
        aria-label="Log an entry"
        className="fixed bottom-6 left-1/2 z-40 h-14 w-14 -translate-x-1/2 rounded-full text-[1.6rem] leading-none shadow-lg"
        style={{
          background: 'var(--ink)',
          color: 'var(--paper-light)',
          bottom: 'calc(1.5rem + env(safe-area-inset-bottom))',
        }}
      >
        +
      </button>

      {sheetOpen && (
        <LogSheet today={today} onClose={() => setSheetOpen(false)} onSave={handleSave} />
      )}
    </main>
  );
}
