'use client';

import { useEffect, useMemo, useState } from 'react';
import { BufferHeadline } from '@/components/BufferHeadline';
import { EntryList } from '@/components/EntryList';
import { LogSheet } from '@/components/LogSheet';
import { MonthProgress } from '@/components/MonthProgress';
import { RecentDays } from '@/components/RecentDays';
import { Screen, Card, Hero } from '@/components/Screen';
import { SettlementPanel } from '@/components/Settlement';
import { SavingsStrip } from '@/components/SavingsStrip';
import { addDays, monthStart, todayISO, shortDate } from '@/lib/date';
import { addEntry, deleteEntry, fetchEntries, settleUp } from '@/lib/entries';
import { byDay, computeToday, php2 } from '@/lib/model';
import { supabase } from '@/lib/supabase';
import { fetchMembers, type Member } from '@/lib/members';
import { fetchConfig } from '@/lib/configStore';
import { DEFAULT_CONFIG, type Config } from '@/lib/config';
import { useSession } from '@/components/AuthGate';
import type { FoodEntry } from '@/lib/types';
import { settle } from '@/lib/close';
import { balanceOf, fetchSavings, type SavingsEntry } from '@/lib/savings';

/** Days of history shown under the fold. */
const RECENT_DAYS = 14;

export default function TodayPage() {
  const [today, setToday] = useState(todayISO);
  const [entries, setEntries] = useState<FoodEntry[]>([]);
  const [config, setConfig] = useState<Config | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  // Bumped by the realtime channel to re-run the fetch effect.
  const [reloadKey, setReloadKey] = useState(0);
  const [members, setMembers] = useState<Member[]>([]);
  const [savings, setSavings] = useState<SavingsEntry[] | null>(null);
  const session = useSession();

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

  // The daily budget and the category list both live in the config blob.
  useEffect(() => {
    let cancelled = false;
    fetchConfig().then(
      (c) => {
        if (!cancelled) setConfig(c);
      },
      () => {
        // A missing config must not blank the screen; fall back to the defaults.
        if (!cancelled) setConfig(DEFAULT_CONFIG);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchMembers().then((m) => {
      if (!cancelled) setMembers(m);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchSavings().then(
      (rows) => !cancelled && setSavings(rows),
      // The savings strip is a summary, not the point of this screen; if it
      // cannot load, the buffer still has to render.
      () => !cancelled && setSavings([]),
    );
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

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

  const food = config?.food ?? DEFAULT_CONFIG.food;
  const stats = useMemo(
    () => computeToday(entries, today, food.dailyBudget),
    [entries, today, food.dailyBudget],
  );
  const todaysEntries = useMemo(
    () => entries.filter((e) => e.spent_on === today),
    [entries, today],
  );
  const recent = useMemo(
    () => byDay(entries.filter((e) => e.spent_on !== today)).slice(0, RECENT_DAYS),
    [entries, today],
  );
  // Settlement runs over the whole fetched window, not just today, so a debt
  // from last week is still visible.
  const outstanding = useMemo(() => settle(entries), [entries]);

  async function handleSave(rows: Parameters<typeof addEntry>[0][]) {
    for (const row of rows) {
      const saved = await addEntry(row);
      setEntries((prev) => (prev.some((e) => e.id === saved.id) ? prev : [saved, ...prev]));
    }
  }

  async function handleSettle() {
    await settleUp();
    setReloadKey((k) => k + 1);
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
    <>
      <Screen title="Plano" meta={shortDate(today)}>
        {error && (
          <p
            className="tint-brick mt-4 border px-3 py-2 text-[12.5px]"
            style={{ borderColor: 'var(--brick)' }}
            role="alert"
          >
            {error}
          </p>
        )}

        {loading ? (
          <p className="empty py-16 text-center">reading the ledger…</p>
        ) : (
          <>
            <Hero>
              <BufferHeadline s={stats} />
            </Hero>

            <div className="mt-4">
              <MonthProgress s={stats} today={today} />
            </div>

            <Card title="Today" amount={php2(stats.spentToday)}>
              <EntryList
                entries={todaysEntries}
                categories={food.categories}
                onDelete={handleDelete}
                pendingDelete={pendingDelete}
                me={session.user.email}
                members={members}
              />
            </Card>

            <SettlementPanel
              settlement={outstanding}
              me={session.user.email}
              members={members}
              onSettle={handleSettle}
            />

            {savings && config && (
              <SavingsStrip
                balance={balanceOf(savings)}
                goalLabel={config.savings.goalLabel}
                goalAmount={config.savings.goalAmount}
              />
            )}

            <RecentDays days={recent} today={today} dailyBudget={food.dailyBudget} />
          </>
        )}
      </Screen>

      <button
        type="button"
        onClick={() => setSheetOpen(true)}
        aria-label="Log a day"
        className="fab"
      >
        +
      </button>

      {sheetOpen && (
        <LogSheet
          today={today}
          food={food}
          buffer={stats.buffer}
          defaultShare={config?.settlement.defaultShare ?? 'none'}
          onClose={() => setSheetOpen(false)}
          onSave={handleSave}
        />
      )}
    </>
  );
}
