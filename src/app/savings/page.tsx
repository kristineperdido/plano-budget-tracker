'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Screen, Card, Hero, Aside } from '@/components/Screen';
import { PersonTag } from '@/components/Payer';
import { useSession } from '@/components/AuthGate';
import { fetchMembers, type Member } from '@/lib/members';
import { fetchConfig } from '@/lib/configStore';
import { fetchEntries } from '@/lib/entries';
import { fetchBills, type BillPayment } from '@/lib/bills';
import {
  addSavings,
  balanceOf,
  deleteSavings,
  fetchSavings,
  sweptMonths,
  type SavingsEntry,
} from '@/lib/savings';
import { closeMonth, type MonthClose } from '@/lib/close';
import { monthIndexOf, todayISO } from '@/lib/date';
import { php } from '@/lib/model';
import { totalMonths } from '@/lib/engine';
import type { Config } from '@/lib/config';
import type { FoodEntry } from '@/lib/types';

/** Every month of the plan that has already begun, newest first. */
function monthsSoFar(config: Config, today: string): string[] {
  const out: string[] = [];
  const [sy, sm] = config.startMonth.split('-').map(Number);
  const span = totalMonths(config.phases);
  const current = monthIndexOf(config.startMonth, today);

  for (let i = 0; i <= Math.min(current, span - 1); i++) {
    const m = sm + i;
    const y = sy + Math.floor((m - 1) / 12);
    out.push(`${y}-${String(((m - 1) % 12) + 1).padStart(2, '0')}`);
  }
  return out.reverse();
}

export default function SavingsPage() {
  const [today] = useState(todayISO);
  const [config, setConfig] = useState<Config | null>(null);
  const [savings, setSavings] = useState<SavingsEntry[] | null>(null);
  const [entries, setEntries] = useState<FoodEntry[]>([]);
  const [bills, setBills] = useState<BillPayment[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [amount, setAmount] = useState('');
  const [moving, setMoving] = useState<'deposit' | 'withdrawal'>('deposit');
  const session = useSession();

  useEffect(() => {
    let cancelled = false;
    fetchConfig().then(
      (c) => {
        if (cancelled) return;
        setConfig(c);
        // The whole plan window, so every month can be closed out.
        const from = `${c.startMonth}-01`;
        Promise.all([fetchEntries(from, today), fetchBills(c.startMonth), fetchMembers()]).then(
          ([e, b, m]) => {
            if (cancelled) return;
            setEntries(e);
            setBills(b);
            setMembers(m);
          },
          (err: unknown) =>
            !cancelled && setError(err instanceof Error ? err.message : 'Could not load.'),
        );
      },
      (e: unknown) => !cancelled && setError(e instanceof Error ? e.message : 'Could not load.'),
    );
    return () => {
      cancelled = true;
    };
  }, [today, reloadKey]);

  useEffect(() => {
    let cancelled = false;
    fetchSavings().then(
      (rows) => !cancelled && setSavings(rows),
      (e: unknown) => !cancelled && setError(e instanceof Error ? e.message : 'Could not load.'),
    );
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const balance = savings ? balanceOf(savings) : 0;
  const swept = useMemo(() => (savings ? sweptMonths(savings) : new Set<string>()), [savings]);

  const months: MonthClose[] = useMemo(() => {
    if (!config) return [];
    return monthsSoFar(config, today).map((m) => closeMonth(config, m, entries, bills, today));
  }, [config, entries, bills, today]);

  // A month can only be banked once it is over and has something left in it.
  const bankable = months.filter((m) => m.complete && !swept.has(m.month) && m.surplus > 0);

  const bank = useCallback(
    async (m: MonthClose) => {
      setBusy(m.month);
      try {
        await addSavings({
          kind: 'sweep',
          amount: Math.round(m.surplus * 100) / 100,
          for_month: m.month,
          note: `Left over from ${m.month}`,
        });
        setReloadKey((k) => k + 1);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not bank it.');
      } finally {
        setBusy(null);
      }
    },
    [],
  );

  const move = useCallback(async () => {
    const v = Number(amount);
    if (!Number.isFinite(v) || v <= 0) return;
    setBusy('move');
    try {
      await addSavings({ kind: moving, amount: v });
      setAmount('');
      setReloadKey((k) => k + 1);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not record it.');
    } finally {
      setBusy(null);
    }
  }, [amount, moving]);

  const goal = config?.savings.goalAmount ?? 0;
  const pct = goal > 0 ? Math.min(balance / goal, 1) : 0;

  return (
    <Screen title="Savings" meta={config ? config.savings.goalLabel : undefined}>
      {error && (
        <p className="tint-brick mt-4 text-[12.5px]" role="alert">
          {error}
        </p>
      )}

      {!config || !savings ? (
        <p className="empty py-16 text-center">counting what&rsquo;s put away…</p>
      ) : (
        <>
          <Hero>
          <section className="pt-5 pb-2 text-center">
            <p className="sign-label tint-teal" style={{ letterSpacing: '0.2em' }}>
              Put away
            </p>
            <p className="num num-hero tint-green mt-2">{php(balance)}</p>
            {goal > 0 && (
              <>
                <div className="pace mt-4">
                  <div className="pace-fill" style={{ width: `${pct * 100}%` }} />
                </div>
                <p className="tint-muted mt-1.5 text-[12px]">
                  {Math.round(pct * 100)}% of {php(goal)} · {config.savings.goalLabel}
                </p>
                {balance < goal && (
                  <Aside tilt={-1.5} className="mt-2">
                    {php(goal - balance)} to go
                  </Aside>
                )}
              </>
            )}
          </section>
          </Hero>

          {/* Banking is deliberate: the app never claims money moved on its own. */}
          <Card title="Ready to bank">
            {bankable.length === 0 ? (
              <p className="empty py-3">
                {months.some((m) => !m.complete && m.surplus > 0)
                  ? 'this month is still running'
                  : 'nothing waiting to be moved'}
              </p>
            ) : (
              bankable.map((m) => (
                <div
                  key={m.month}
                  className="relative mb-2.5 border p-3"
                  style={{ borderColor: 'var(--rule)' }}
                >
                  <span className="tape" style={{ left: 22 }} aria-hidden />
                  <div className="leader mb-1.5">
                    <h3 className="sign-label">{m.month}</h3>
                    <span className="leader-fill" aria-hidden />
                    <span className="num tint-green text-[20px]">{php(m.surplus)}</span>
                  </div>
                  <p className="row-meta">
                    food {php(m.foodSpent)} of {php(m.foodBudget)}
                    {m.billsPlanned > 0 &&
                      ` · bills ${php(m.billsActual)} of ${php(m.billsPlanned)}`}
                  </p>
                  {m.billsMissing > 0 && (
                    <Aside tilt={-1.5} tint="gold" className="mt-1.5">
                      {m.billsMissing} {m.billsMissing === 1 ? 'bill has' : 'bills have'} no figure
                      yet — this could change
                    </Aside>
                  )}
                  <button
                    type="button"
                    className="btn btn--primary mt-3"
                    disabled={busy === m.month}
                    onClick={() => void bank(m)}
                  >
                    {busy === m.month ? 'Banking…' : `Bank ${php(m.surplus)}`}
                  </button>
                  <p className="row-meta mt-1.5 text-center">
                    move it in your bank app too — this only records it
                  </p>
                </div>
              ))
            )}
          </Card>

          {/* Month history. */}
          <Card title="Month by month">
            {months.length === 0 ? (
              <p className="empty py-3">the plan hasn&rsquo;t started yet</p>
            ) : (
              months.map((m) => {
                const done = swept.has(m.month);
                return (
                  <div key={m.month} className="row">
                    <span className="num tint-muted w-[62px] text-[12px]">{m.month}</span>
                    <span className="row-label">
                      spent {php(m.foodSpent + m.billsActual)}
                      <span className="row-meta block">
                        of {php(m.foodBudget + m.billsPlanned)} planned
                        {!m.complete && ' · still running'}
                        {done && ' · banked'}
                      </span>
                    </span>
                    <span
                      className={`num text-[14px] ${m.surplus >= 0 ? 'tint-green' : 'tint-brick'}`}
                    >
                      {m.surplus >= 0 ? '+' : '−'}
                      {php(Math.abs(m.surplus))}
                    </span>
                  </div>
                );
              })
            )}
          </Card>

          {/* Anything that isn't a month-end sweep. */}
          <Card title="Move money by hand">
            <div className="flex gap-1.5">
              <button
                type="button"
                className="chip flex-1"
                data-on={moving === 'deposit'}
                aria-pressed={moving === 'deposit'}
                onClick={() => setMoving('deposit')}
              >
                Put in
              </button>
              <button
                type="button"
                className="chip flex-1"
                data-on={moving === 'withdrawal'}
                aria-pressed={moving === 'withdrawal'}
                onClick={() => setMoving('withdrawal')}
              >
                Take out
              </button>
            </div>
            <div className="mt-2.5 flex items-baseline gap-2">
              <span className="num text-[20px]">₱</span>
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
                placeholder="0"
                aria-label="Amount to move"
                className="field flex-1 text-[20px]"
                style={{ textAlign: 'left' }}
              />
              <button
                type="button"
                className="btn btn--ghost"
                style={{ width: 'auto', padding: '12px 16px' }}
                disabled={busy === 'move' || !amount.trim()}
                onClick={() => void move()}
              >
                {busy === 'move' ? 'Saving…' : 'Record'}
              </button>
            </div>
          </Card>

          <Card title="The ledger" amount={php(balance)} className="mb-8">
            {savings.length === 0 ? (
              <p className="empty py-3">nothing put away yet</p>
            ) : (
              savings.map((e) => (
                <div key={e.id} className="row">
                  <span className="num tint-muted w-[62px] text-[11.5px]">{e.banked_on}</span>
                  <span className="row-label">
                    {e.kind === 'sweep'
                      ? `Left over from ${e.for_month}`
                      : e.kind === 'deposit'
                        ? 'Put in'
                        : 'Taken out'}
                    <span className="row-meta block">
                      <PersonTag person={e.person} me={session.user.email} members={members} />
                    </span>
                  </span>
                  <span className={`num text-[14px] ${e.amount < 0 ? 'tint-brick' : 'tint-green'}`}>
                    {e.amount < 0 ? '−' : '+'}
                    {php(Math.abs(e.amount))}
                  </span>
                  <button
                    type="button"
                    onClick={async () => {
                      setBusy(e.id);
                      try {
                        await deleteSavings(e.id);
                        setReloadKey((k) => k + 1);
                      } catch (err) {
                        setError(err instanceof Error ? err.message : 'Could not remove it.');
                      } finally {
                        setBusy(null);
                      }
                    }}
                    disabled={busy === e.id}
                    aria-label="Remove this savings record"
                    className="tint-muted -my-2 px-2 py-3 text-[15px] leading-none disabled:opacity-40"
                  >
                    ×
                  </button>
                </div>
              ))
            )}
          </Card>
        </>
      )}
    </Screen>
  );
}
