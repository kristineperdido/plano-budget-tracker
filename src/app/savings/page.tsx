'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Screen, Card, Hero, Aside } from '@/components/Screen';
import { PersonTag } from '@/components/Payer';
import { useSession } from '@/components/AuthGate';
import { fetchMembers, type Member } from '@/lib/members';
import { useConfig } from '@/lib/useConfig';
import { fetchEntries } from '@/lib/entries';
import { fetchBills, type BillPayment } from '@/lib/bills';
import {
  addSavings,
  deleteSavings,
  fetchSavings,
  type SavingsEntry,
} from '@/lib/savings';
import { balanceOf, closeMonth, settledMonths, type MonthClose } from '@/lib/close';
import { confidenceOf } from '@/lib/cashflow';
import { monthIndexOf, todayISO } from '@/lib/date';
import { php } from '@/lib/model';
import { totalMonths } from '@/lib/engine';
import type { Config } from '@/lib/config';
import type { FoodEntry } from '@/lib/types';

/** Every month of the plan that has already begun, newest first. */
function monthsSoFar(config: Config, today: string): string[] {
  const out: string[] = [];
  const [sy, sm] = config.startMonth.split('-').map(Number);
  const span = totalMonths(config.phases, config.startMonth);
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
  const { config } = useConfig();

  // The whole plan window, so every month can be closed out.
  useEffect(() => {
    if (!config) return;
    let cancelled = false;
    const from = `${config.startMonth}-01`;
    Promise.all([fetchEntries(from, today), fetchBills(config.startMonth), fetchMembers()]).then(
      ([e, b, m]) => {
        if (cancelled) return;
        setEntries(e);
        setBills(b);
        setMembers(m);
      },
      (err: unknown) =>
        !cancelled && setError(err instanceof Error ? err.message : 'Could not load.'),
    );
    return () => {
      cancelled = true;
    };
  }, [config, today, reloadKey]);

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
  const swept = useMemo(() => (savings ? settledMonths(savings) : new Set<string>()), [savings]);

  const months: MonthClose[] = useMemo(() => {
    if (!config) return [];
    return monthsSoFar(config, today).map((m) => closeMonth(config, m, entries, bills, today));
  }, [config, entries, bills, today]);

  // A month can only be banked once it is over and has something left in it.
  const bankable = months.filter((m) => m.complete && !swept.has(m.month) && m.surplus > 0);
  // Months that cost more than they had. Savings used to ignore these entirely,
  // so the balance could only ever climb.
  const overspent = months.filter((m) => m.complete && !swept.has(m.month) && m.surplus < 0);

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

  const drawDown = useCallback(async (m: MonthClose) => {
    setBusy(m.month);
    try {
      await addSavings({
        kind: 'drawdown',
        amount: Math.round(-m.surplus * 100) / 100,
        for_month: m.month,
        note: `${m.month} cost more than it had`,
      });
      setReloadKey((k) => k + 1);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not record it.');
    } finally {
      setBusy(null);
    }
  }, []);

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

  // What was brought into the move, split by how much it can be relied on.
  // These live in the plan as `moneyIn`; the ledger below is what has been put
  // away since. They were two unconnected numbers both called savings.
  const opening = useMemo(() => {
    const r = { committed: 0, uncertain: 0, backup: 0 };
    for (const m of config?.moneyIn ?? []) r[confidenceOf(m)] += m.amount;
    return r;
  }, [config]);

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
          {/* Only the figure is full-bleed. Hero cancels the page gutter so a
              centred number sits on the page's midline rather than the
              content column's — but anything full-width inside it runs past
              the red margin rule at 34px, which the goal bar did. */}
          <Hero>
            <section className="pt-5 pb-1 text-center">
              <p className="sign-label tint-teal" style={{ letterSpacing: '0.2em' }}>
                Put away
              </p>
              <p className="num num-hero tint-green mt-2">{php(balance)}</p>
            </section>
          </Hero>

          {goal > 0 && (
            <section className="pb-1 text-center">
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
            </section>
          )}

          <Card title="What you have">
            <div className="row">
              <span className="row-label">
                Money in hand at move-in
                <span className="row-meta block">savings and anything counted on</span>
              </span>
              <span className="num text-[13px]">{php(opening.committed)}</span>
            </div>
            <div className="row">
              <span className="row-label">
                Put away since
                <span className="row-meta block">banked from months that came in under</span>
              </span>
              <span className={`num text-[13px] ${balance < 0 ? 'tint-brick' : 'tint-green'}`}>
                {php(balance)}
              </span>
            </div>
            <div className="leader mt-2 border-t pt-2.5" style={{ borderColor: 'var(--rule)' }}>
              <span className="sign-label">Available</span>
              <span className="leader-fill" aria-hidden />
              <span className="num text-[17px]">{php(opening.committed + balance)}</span>
            </div>

            {opening.uncertain > 0 && (
              <div className="row">
                <span className="row-label">
                  Uncertain
                  <span className="row-meta block">not counted above</span>
                </span>
                <span className="num tint-gold text-[13px]">{php(opening.uncertain)}</span>
              </div>
            )}
            {opening.backup > 0 && (
              <div className="row">
                <span className="row-label">
                  Held back
                  <span className="row-meta block">not counted above</span>
                </span>
                <span className="num tint-muted text-[13px]">{php(opening.backup)}</span>
              </div>
            )}
          </Card>

          {overspent.length > 0 && (
            <Card title="Months that cost more than they had">
              <Aside tilt={-1.5} tint="brick" className="mb-2">
                covered out of savings — record it or the balance drifts up
              </Aside>
              {overspent.map((m) => (
                <div key={m.month} className="row">
                  <span className="row-label">
                    {m.month}
                    <span className="row-meta block">
                      spent {php(m.foodSpent + m.billsActual)} of{' '}
                      {php(m.foodBudget + m.billsPlanned)}
                    </span>
                  </span>
                  <button
                    type="button"
                    className="chip tint-brick"
                    disabled={busy === m.month}
                    onClick={() => void drawDown(m)}
                  >
                    {busy === m.month ? 'Saving…' : `Took ${php(-m.surplus)}`}
                  </button>
                </div>
              ))}
            </Card>
          )}

          {/* Banking is deliberate: the app never claims money moved on its own. */}
          <Card title="Ready to bank">
            <Aside tilt={-1.5} className="mb-2">
              whatever the side pot still holds on the 1st, plus anything the bills came in
              under
            </Aside>
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
            <div className="mt-2.5 flex items-center gap-2">
              <span className="num text-[20px]">₱</span>
              {/* min-w-0 matters: a flex item's minimum defaults to its
                  intrinsic size, and an input's intrinsic size is about twenty
                  characters — so flex-1 let this grow but never shrink, and it
                  pushed the button off the card. */}
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
                placeholder="0"
                aria-label="Amount to move"
                className="field min-w-0 flex-1 text-[20px]"
                style={{ textAlign: 'left' }}
              />
              <button
                type="button"
                className="tap-target shrink-0"
                disabled={busy === 'move' || !amount.trim()}
                onClick={() => void move()}
              >
                <span className="chip chip--sm whitespace-nowrap">
                  {busy === 'move' ? 'Saving…' : 'Record'}
                </span>
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
                      : e.kind === 'drawdown'
                        ? `Covered ${e.for_month}`
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
