'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AmountField } from '@/components/AmountField';
import { Screen, Card, Aside } from '@/components/Screen';
import { PayerTag } from '@/components/Payer';
import {
  PAYER_DESCRIPTION,
  type Cadence,
  type Config,
  type LineItem,
  type Payer,
} from '@/lib/config';
import { fetchConfig, logChange, saveConfig } from '@/lib/configStore';
import { foodForecast, householdCost } from '@/lib/engine';
import { fetchBills, recordBill, type BillPayment } from '@/lib/bills';
import { monthOf } from '@/lib/close';
import { todayISO } from '@/lib/date';
import { php } from '@/lib/model';

const PAYERS: Payer[] = ['her', 'him', 'split', 'each'];

/**
 * The ledger reads as a priced-up list, so it groups by *when* a cost lands
 * rather than by which part of the flat it belongs to: what you pay once to get
 * in, and what comes back every month.
 */
const SECTIONS: { cadence: Cadence; title: string }[] = [
  { cadence: 'onetime', title: 'Move-in' },
  { cadence: 'monthly', title: 'Every month' },
];

export default function LedgerPage() {
  const [config, setConfig] = useState<Config | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Cadence, payer and start-month chips only appear on the row being edited.
  const [editing, setEditing] = useState<string | null>(null);
  const [bills, setBills] = useState<BillPayment[]>([]);
  const [thisMonth] = useState(() => monthOf(todayISO()));

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

  // What the monthly bills have actually come to this month.
  useEffect(() => {
    let cancelled = false;
    fetchBills(thisMonth).then(
      (b) => !cancelled && setBills(b),
      // Actuals are an overlay; the plan still has to render without them.
      () => !cancelled && setBills([]),
    );
    return () => {
      cancelled = true;
    };
  }, [thisMonth]);

  const actualFor = useCallback(
    (itemId: string) =>
      bills.find((b) => b.item_id === itemId && b.for_month === thisMonth)?.amount ?? null,
    [bills, thisMonth],
  );

  const saveActual = useCallback(
    async (item: LineItem, amount: number) => {
      setSaving(true);
      try {
        const saved = await recordBill({ item_id: item.id, for_month: thisMonth, amount });
        setBills((prev) => [
          ...prev.filter((b) => !(b.item_id === item.id && b.for_month === thisMonth)),
          saved,
        ]);
        await logChange(`${item.label} came to ${php(amount)} in ${thisMonth}`);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not record it.');
      } finally {
        setSaving(false);
      }
    },
    [thisMonth],
  );

  // Persist immediately: two people on two phones, so leaving edits unsaved in
  // local state would quietly diverge.
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

  const updateItem = useCallback(
    (id: string, patch: Partial<LineItem>, note: string) => {
      if (!config) return;
      void persist(
        { ...config, items: config.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) },
        note,
      );
    },
    [config, persist],
  );

  const deleteItem = useCallback(
    (item: LineItem) => {
      if (!config) return;
      void persist(
        { ...config, items: config.items.filter((i) => i.id !== item.id) },
        `Removed ${item.label}`,
      );
    },
    [config, persist],
  );

  const addItem = useCallback(
    (cadence: Cadence) => {
      if (!config) return;
      const item: LineItem = {
        id: `item-${Date.now()}`,
        label: 'New item',
        amount: 0,
        cadence,
        startMonth: 0,
        payer: 'split',
        group: cadence === 'onetime' ? 'movein' : 'living',
      };
      setEditing(item.id);
      void persist({ ...config, items: [...config.items, item] }, 'Added a line item');
    },
    [config, persist],
  );

  const active = useMemo(() => config?.items.filter((i) => !i.pending) ?? [], [config]);
  const forecast = useMemo(() => (config ? foodForecast(config.food) : null), [config]);

  return (
    <Screen
      title="Ledger"
      meta={
        saving ? (
          <span className="marker tint-gold text-[17px]">saving…</span>
        ) : (
          `${active.length} items`
        )
      }
    >
      {error && (
        <p className="tint-brick mt-4 text-[12.5px]" role="alert">
          {error}
        </p>
      )}

      {!config ? (
        <p className="empty py-16 text-center">opening the ledger…</p>
      ) : (
        <>
          {SECTIONS.map((s) => {
            const rows = active.filter((i) => i.cadence === s.cadence);
            // Household cost, not face value: an 'each' item is paid in full
            // by both, so a 500 keycard costs the two of them 1,000. Summing
            // raw amounts here is what made this subtotal read 500 less than
            // the figure the Plan charges for the very same list.
            const subtotal = rows.reduce((sum, i) => sum + householdCost(i), 0);
            return (
              <Card key={s.cadence} title={s.title} amount={php(subtotal)}>
                {rows.length === 0 && <p className="empty py-3">nothing here yet</p>}

                {rows.map((item) => {
                  const open = editing === item.id;
                  return (
                    <div key={item.id}>
                      <div className="row">
                        <button
                          type="button"
                          onClick={() => setEditing(open ? null : item.id)}
                          aria-expanded={open}
                          aria-label={`Edit how ${item.label} is paid`}
                          className="flex-none"
                        >
                          <PayerTag payer={item.payer} />
                        </button>

                        <input
                          aria-label={`Name of ${item.label}`}
                          className="row-label min-w-0 border-b border-transparent bg-transparent outline-none focus:border-[var(--ink)]"
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
                            updateItem(
                              item.id,
                              { label: e.target.value },
                              `Renamed to ${e.target.value}`,
                            )
                          }
                        />

                        <AmountField
                          label={`Amount for ${item.label}`}
                          value={item.amount}
                          onCommit={(v) =>
                            updateItem(item.id, { amount: v }, `${item.label} set to ${php(v)}`)
                          }
                        />
                      </div>

                      {item.note && !open && (
                        <p className="row-meta -mt-1 mb-2 pl-[61px]">{item.note}</p>
                      )}

                      {/* What it actually came to. Only monthly bills vary
                          enough to be worth chasing month by month. */}
                      {s.cadence === 'monthly' && (
                        <div className="-mt-1 mb-2 flex items-center gap-2 pl-[61px]">
                          <span className="row-meta flex-1">
                            {(() => {
                              const actual = actualFor(item.id);
                              if (actual === null) return `${thisMonth} — not recorded`;
                              const diff = item.amount - actual;
                              if (Math.abs(diff) < 0.5) return `${thisMonth} — exactly as planned`;
                              return (
                                <>
                                  {thisMonth} —{' '}
                                  <span className={diff > 0 ? 'tint-green' : 'tint-brick'}>
                                    {php(Math.abs(diff))} {diff > 0 ? 'under' : 'over'}
                                  </span>
                                </>
                              );
                            })()}
                          </span>
                          <span className="tint-muted text-[11px]">came to</span>
                          <AmountField
                            label={`What ${item.label} came to in ${thisMonth}`}
                            value={actualFor(item.id) ?? item.amount}
                            onCommit={(v) => void saveActual(item, v)}
                          />
                        </div>
                      )}

                      {open && (
                        <div className="mb-3 flex flex-wrap items-center gap-1.5 pl-[61px]">
                          {PAYERS.map((p) => (
                            <button
                              key={p}
                              type="button"
                              className="chip chip--marker"
                              data-on={item.payer === p}
                              aria-pressed={item.payer === p}
                              onClick={() =>
                                updateItem(
                                  item.id,
                                  { payer: p },
                                  `${item.label}: ${PAYER_DESCRIPTION[p]}`,
                                )
                              }
                            >
                              {PAYER_DESCRIPTION[p]}
                            </button>
                          ))}
                          <button
                            type="button"
                            className="chip"
                            onClick={() =>
                              updateItem(
                                item.id,
                                { cadence: item.cadence === 'monthly' ? 'onetime' : 'monthly' },
                                `${item.label} is now ${
                                  item.cadence === 'monthly' ? 'one-time' : 'monthly'
                                }`,
                              )
                            }
                          >
                            {item.cadence === 'monthly' ? 'monthly' : 'one-time'}
                          </button>
                          <span className="chip flex items-center gap-1">
                            <span>from month</span>
                            <AmountField
                              label={`Start month for ${item.label}`}
                              prefix=""
                              width="1.6rem"
                              value={item.startMonth}
                              onCommit={(v) =>
                                updateItem(
                                  item.id,
                                  { startMonth: Math.round(v) },
                                  `${item.label} starts month ${Math.round(v)}`,
                                )
                              }
                            />
                          </span>
                          <button
                            type="button"
                            onClick={() => deleteItem(item)}
                            className="chip tint-brick"
                          >
                            Remove
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}

                <button type="button" onClick={() => addItem(s.cadence)} className="btn btn--dashed mt-2">
                  + one more
                </button>
              </Card>
            );
          })}

          {/* Food is computed from the day types, so it is shown but never edited here. */}
          {forecast && (
            <Card title="Food" amount={php(forecast.perMonth)}>
              <div className="row">
                <PayerTag payer="split" />
                <span className="row-label">
                  Meals and extras
                  <span className="row-meta block">edited on the Food screen</span>
                </span>
                <span className="marker tint-gold text-[17px]">derived</span>
              </div>
            </Card>
          )}

          <Card
            title="Money in"
            amount={php(config.moneyIn.reduce((s, m) => s + m.amount, 0))}
            className="mb-8"
          >
            {config.moneyIn.map((m) => (
              <div key={m.id}>
                <div className="row">
                  <PayerTag payer={m.owner} />
                  <span className="row-label">
                    {m.label}
                    {m.note && <span className="row-meta block">{m.note}</span>}
                  </span>
                  {m.uncertain && <span className="stamp stamp--gold">Uncertain</span>}
                  {m.backup && <span className="stamp stamp--muted">Backup</span>}
                  <AmountField
                    label={`Amount for ${m.label}`}
                    value={m.amount}
                    onCommit={(v) =>
                      void persist(
                        {
                          ...config,
                          moneyIn: config.moneyIn.map((x) =>
                            x.id === m.id ? { ...x, amount: v } : x,
                          ),
                        },
                        `${m.label} set to ${php(v)}`,
                      )
                    }
                  />
                </div>
              </div>
            ))}

            <Aside tilt={-1.5} className="mt-3">
              tap a name to change who pays
            </Aside>
          </Card>
        </>
      )}
    </Screen>
  );
}
