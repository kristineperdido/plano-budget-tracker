'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Screen, Card, Aside } from '@/components/Screen';
import { AmountField } from '@/components/AmountField';
import { PayerTag } from '@/components/Payer';
import { isUnbounded, type Config, type LineItem } from '@/lib/config';
import { fetchConfig, logChange, saveConfig } from '@/lib/configStore';
import { computePlan } from '@/lib/engine';
import { php } from '@/lib/model';

/** The worst this item could cost: the top of its range, or its flat amount. */
function worstCase(item: LineItem): number {
  return item.estimateHigh ?? item.amount;
}

export default function PendingPage() {
  const [config, setConfig] = useState<Config | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchConfig().then(
      (c) => !cancelled && setConfig(c),
      (e: unknown) => !cancelled && setError(e instanceof Error ? e.message : 'Could not load.'),
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const persist = useCallback(async (next: Config, note: string) => {
    setConfig(next);
    setSaving(true);
    try {
      await saveConfig(next);
      await logChange(note);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  }, []);

  const pending = useMemo(() => config?.items.filter((i) => i.pending) ?? [], [config]);

  // What the plan looks like now, and what it looks like if every pending item
  // lands at the top of its range.
  const now = useMemo(
    () => (config ? computePlan(config, { includeUncertain: true, includePending: false }) : null),
    [config],
  );
  const worst = useMemo(() => {
    if (!config) return null;
    const inflated: Config = {
      ...config,
      items: config.items.map((i) => (i.pending ? { ...i, amount: worstCase(i) } : i)),
    };
    return computePlan(inflated, { includeUncertain: true, includePending: true });
  }, [config]);

  const exposure = now && worst ? now.combined - worst.combined : 0;
  const unbounded = pending.filter(isUnbounded);

  return (
    <Screen title="Pending" meta={config ? `${pending.length} items` : undefined}>
      {error && (
        <p className="tint-brick mt-4 text-[12.5px]" role="alert">
          {error}
        </p>
      )}

      {!config ? (
        <p className="empty py-16 text-center">reading the ledger…</p>
      ) : (
        <>
          <Card>
            <Aside tilt={-1.5} className="text-[21px]">
              Known, but not yet priced.
              <br />
              Left out of the plan on purpose.
            </Aside>
            <p className="tint-muted mt-2 text-[12.5px] leading-[1.5]">
              Nothing on this page touches any total until you confirm it. That way the plan shows
              what you actually know, rather than looking worse than reality because of a guess.
            </p>
          </Card>

          {pending.length === 0 && (
            <Card>
              <p className="empty py-2">nothing outstanding</p>
            </Card>
          )}

          {pending.map((item) => {
            const unknown = isUnbounded(item);
            return (
              <div key={item.id} className="panel mt-4">
                <span className="tape" style={{ left: 20 }} aria-hidden />

                <div className="mb-1.5 flex items-baseline justify-between gap-3">
                  <input
                    aria-label={`Name of ${item.label}`}
                    className="sign min-w-0 flex-1 border-b border-transparent bg-transparent text-[15px] outline-none focus:border-[var(--ink)]"
                    value={item.label}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        items: config.items.map((i) =>
                          i.id === item.id ? { ...i, label: e.target.value } : i,
                        ),
                      })
                    }
                    onBlur={(e) =>
                      void persist(
                        {
                          ...config,
                          items: config.items.map((i) =>
                            i.id === item.id ? { ...i, label: e.target.value } : i,
                          ),
                        },
                        `Pending item renamed to ${e.target.value}`,
                      )
                    }
                  />
                  <span className="stamp stamp--gold">Pending</span>
                </div>

                {item.note && <p className="tint-muted mb-2 text-[12.5px]">{item.note}</p>}

                <div className="row">
                  <span className="row-label">Estimate</span>
                  {unknown ? (
                    <span className="marker tint-gold text-[26px]">???</span>
                  ) : item.estimateLow !== undefined && item.estimateHigh !== undefined ? (
                    <span className="num tint-gold text-[14px]">
                      {php(item.estimateLow)}–{php(item.estimateHigh)}
                    </span>
                  ) : (
                    <AmountField
                      label={`Estimate for ${item.label}`}
                      value={item.amount}
                      onCommit={(v) =>
                        void persist(
                          {
                            ...config,
                            items: config.items.map((i) =>
                              i.id === item.id ? { ...i, amount: v } : i,
                            ),
                          },
                          `${item.label} estimated at ${php(v)}`,
                        )
                      }
                    />
                  )}
                </div>

                <div className="row">
                  <span className="row-label">Who pays, once it lands</span>
                  <PayerTag payer={item.payer} fixed={false} />
                </div>

                <div className="mt-3 flex gap-2.5">
                  <button
                    type="button"
                    className="btn btn--primary flex-[2]"
                    disabled={saving}
                    onClick={() =>
                      void persist(
                        {
                          ...config,
                          items: config.items.map((i) =>
                            i.id === item.id
                              ? {
                                  ...i,
                                  pending: false,
                                  // A confirmed range settles at its top: better
                                  // for the plan to be pessimistic than surprised.
                                  amount: i.estimateHigh ?? i.amount,
                                  estimateLow: undefined,
                                  estimateHigh: undefined,
                                }
                              : i,
                          ),
                        },
                        `Confirmed ${item.label} at ${php(worstCase(item))}`,
                      )
                    }
                  >
                    Confirm in
                  </button>
                  <button
                    type="button"
                    className="btn btn--ghost flex-1"
                    disabled={saving}
                    onClick={() =>
                      void persist(
                        { ...config, items: config.items.filter((i) => i.id !== item.id) },
                        `Dropped ${item.label}`,
                      )
                    }
                  >
                    Drop
                  </button>
                </div>
              </div>
            );
          })}

          {pending.length > 0 && now && worst && (
            <div className="panel mt-4">
              <div className="leader">
                <span className="sign-label tint-teal">
                  {unbounded.length > 0 ? 'At least' : 'If they all land high'}
                </span>
                <span className="leader-fill" aria-hidden />
                <span className="num tint-gold text-[14px]">−{php(exposure)}</span>
              </div>

              {/* An item nobody can price has no worst case. Reporting its
                  exposure as zero would read as "no risk here", which is the
                  opposite of true, so it is named rather than totalled. */}
              {unbounded.length > 0 && (
                <Aside tilt={-1.5} tint="gold" className="mt-2">
                  plus {unbounded.map((i) => i.label.toLowerCase()).join(' and ')}, which
                  {unbounded.length === 1 ? ' has' : ' have'} no figure at all — this total is a
                  floor, not a worst case
                </Aside>
              )}

              <Aside tilt={-1.5} tint={worst.combined >= 0 ? 'green' : 'brick'} className="mt-2">
                combined lands at {php(worst.combined)}
                {unbounded.length > 0 ? ' before those' : ''} —{' '}
                {worst.combined >= 0 ? 'still holds' : 'that would not hold'}
              </Aside>
            </div>
          )}

          <button
            type="button"
            className="btn btn--dashed mt-4 mb-8"
            onClick={() =>
              void persist(
                {
                  ...config,
                  items: [
                    ...config.items,
                    {
                      id: `pending-${Date.now()}`,
                      label: 'Something not yet priced',
                      amount: 0,
                      cadence: 'onetime',
                      startMonth: 0,
                      payer: 'split',
                      group: 'movein',
                      pending: true,
                    },
                  ],
                },
                'Added a pending item',
              )
            }
          >
            + one more unknown
          </button>
        </>
      )}
    </Screen>
  );
}
