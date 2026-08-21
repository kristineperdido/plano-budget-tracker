'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AmountField } from '@/components/AmountField';
import { Screen, Card, Aside } from '@/components/Screen';
import { PayerTag } from '@/components/Payer';
import {
  PAYER_DESCRIPTION,
  PAYER_LABEL,
  type MoneyIn,
  type Cadence,
  type LineItem,
  type Payer,
} from '@/lib/config';
import { logChange } from '@/lib/configStore';
import { useConfig } from '@/lib/useConfig';
import { foodForecast, householdCost } from '@/lib/engine';
import { fetchBills, recordBill, type BillPayment } from '@/lib/bills';
import { monthOf } from '@/lib/close';
import { monthOfIndex, todayISO } from '@/lib/date';
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
  const { config, setConfig, persist, saving, error, setError } = useConfig();
  // Cadence, payer and start-month chips only appear on the row being edited.
  const [editing, setEditing] = useState<string | null>(null);
  const [bills, setBills] = useState<BillPayment[]>([]);
  const [thisMonth] = useState(() => monthOf(todayISO()));

  // Actuals across the whole plan, not just this month: a one-time move-in cost
  // is due in its own month, which is usually in the past by the time you have
  // the receipt.
  useEffect(() => {
    if (!config) return;
    let cancelled = false;
    fetchBills(config.startMonth).then(
      (b) => !cancelled && setBills(b),
      // Actuals are an overlay; the plan still has to render without them.
      () => !cancelled && setBills([]),
    );
    return () => {
      cancelled = true;
    };
  }, [config]);

  /**
   * The month a bill belongs to. A recurring cost is asked about for the month
   * you are in; a one-time cost lands once, in whichever month the plan
   * schedules it.
   */
  const billMonth = useCallback(
    (item: LineItem) =>
      item.cadence === 'onetime' && config
        ? monthOfIndex(config.startMonth, item.startMonth)
        : thisMonth,
    [config, thisMonth],
  );

  const actualFor = useCallback(
    (item: LineItem) =>
      bills.find((b) => b.item_id === item.id && b.for_month === billMonth(item))?.amount ?? null,
    [bills, billMonth],
  );

  const [savingBill, setSavingBill] = useState(false);
  const saveActual = useCallback(
    async (item: LineItem, amount: number) => {
      const month = billMonth(item);
      setSavingBill(true);
      try {
        const saved = await recordBill({ item_id: item.id, for_month: month, amount });
        setBills((prev) => [
          ...prev.filter((b) => !(b.item_id === item.id && b.for_month === month)),
          saved,
        ]);
        await logChange(`${item.label} came to ${php(amount)} in ${month}`);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not record it.');
      } finally {
        setSavingBill(false);
      }
    },
    [billMonth, setError],
  );

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
        saving || savingBill ? (
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
                <p className="row-meta -mt-1 mb-2">
                  {s.cadence === 'onetime'
                    ? 'paid once, at move-in · counted as costs on Plan'
                    : 'every month for as long as the plan runs · counted as costs on Plan'}
                </p>
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
                      {(
                        <div className="-mt-1 mb-2 flex items-center gap-2 pl-[61px]">
                          <span className="row-meta flex-1">
                            {(() => {
                              const actual = actualFor(item);
                              if (actual === null) return `${billMonth(item)} — not recorded`;
                              const diff = item.amount - actual;
                              if (Math.abs(diff) < 0.5) return `${billMonth(item)} — exactly as planned`;
                              return (
                                <>
                                  {billMonth(item)} —{' '}
                                  <span className={diff > 0 ? 'tint-green' : 'tint-brick'}>
                                    {php(Math.abs(diff))} {diff > 0 ? 'under' : 'over'}
                                  </span>
                                </>
                              );
                            })()}
                          </span>
                          <span className="tint-muted text-[11px]">came to</span>
                          <AmountField
                            label={`What ${item.label} came to in ${billMonth(item)}`}
                            value={actualFor(item) ?? item.amount}
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

                          <input
                            aria-label={`Note for ${item.label}`}
                            placeholder="a note about this cost…"
                            className="field-text mt-1"
                            style={{ textAlign: 'left' }}
                            value={item.note ?? ''}
                            onChange={(e) =>
                              setConfig({
                                ...config,
                                items: config.items.map((i) =>
                                  i.id === item.id ? { ...i, note: e.target.value } : i,
                                ),
                              })
                            }
                            onBlur={(e) =>
                              updateItem(
                                item.id,
                                { note: e.target.value.trim() || undefined },
                                `Note on ${item.label} updated`,
                              )
                            }
                          />
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
              <p className="row-meta -mt-1 mb-2">
                worked out from your day types · set on the Food screen
              </p>
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
            <p className="row-meta -mt-1 mb-2">
              what you bring in · Plan draws on this, in order of how sure it is
            </p>
            {config.moneyIn.map((m) => {
              const open = editing === m.id;
              const patch = (change: Partial<MoneyIn>, note: string) =>
                void persist(
                  {
                    ...config,
                    moneyIn: config.moneyIn.map((x) =>
                      x.id === m.id ? { ...x, ...change } : x,
                    ),
                  },
                  note,
                );

              return (
                <div key={m.id}>
                  <div className="row">
                    <button
                      type="button"
                      onClick={() => setEditing(open ? null : m.id)}
                      aria-expanded={open}
                      aria-label={`Edit ${m.label}`}
                      className="flex-none"
                    >
                      <PayerTag payer={m.owner} />
                    </button>

                    <input
                      aria-label={`Name of ${m.label}`}
                      className="row-label min-w-0 border-b border-transparent bg-transparent outline-none focus:border-[var(--ink)]"
                      value={m.label}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          moneyIn: config.moneyIn.map((x) =>
                            x.id === m.id ? { ...x, label: e.target.value } : x,
                          ),
                        })
                      }
                      onBlur={(e) => patch({ label: e.target.value }, `Renamed to ${e.target.value}`)}
                    />

                    {m.uncertain && <span className="stamp stamp--gold">Uncertain</span>}
                    {m.backup && <span className="stamp stamp--muted">Backup</span>}

                    <AmountField
                      label={`Amount for ${m.label}`}
                      value={m.amount}
                      onCommit={(v) => patch({ amount: v }, `${m.label} set to ${php(v)}`)}
                    />
                  </div>

                  {m.note && !open && <p className="row-meta -mt-1 mb-2 pl-[61px]">{m.note}</p>}

                  {open && (
                    <div className="mb-3 pl-[61px]">
                      <input
                        aria-label={`Note for ${m.label}`}
                        placeholder="a note about this money…"
                        className="field-text mb-2"
                        style={{ textAlign: 'left' }}
                        value={m.note ?? ''}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            moneyIn: config.moneyIn.map((x) =>
                              x.id === m.id ? { ...x, note: e.target.value } : x,
                            ),
                          })
                        }
                        onBlur={(e) =>
                          patch(
                            { note: e.target.value.trim() || undefined },
                            `Note on ${m.label} updated`,
                          )
                        }
                      />

                      <div className="flex flex-wrap items-center gap-1.5">
                        {(['her', 'him'] as const).map((who) => (
                          <button
                            key={who}
                            type="button"
                            className="chip chip--marker"
                            data-on={m.owner === who}
                            aria-pressed={m.owner === who}
                            onClick={() =>
                              patch({ owner: who }, `${m.label} belongs to ${PAYER_LABEL[who]}`)
                            }
                          >
                            {PAYER_LABEL[who]}
                          </button>
                        ))}

                        <button
                          type="button"
                          className="chip"
                          data-on={Boolean(m.uncertain)}
                          aria-pressed={Boolean(m.uncertain)}
                          onClick={() =>
                            patch(
                              { uncertain: m.uncertain ? undefined : true },
                              `${m.label} is ${m.uncertain ? 'now counted on' : 'no longer certain'}`,
                            )
                          }
                        >
                          Uncertain
                        </button>

                        <button
                          type="button"
                          className="chip"
                          data-on={Boolean(m.backup)}
                          aria-pressed={Boolean(m.backup)}
                          onClick={() =>
                            patch(
                              { backup: m.backup ? undefined : true },
                              `${m.label} is ${m.backup ? 'back in the plan' : 'held back'}`,
                            )
                          }
                        >
                          Held back
                        </button>

                        <button
                          type="button"
                          className="chip tint-brick"
                          onClick={() =>
                            void persist(
                              { ...config, moneyIn: config.moneyIn.filter((x) => x.id !== m.id) },
                              `Removed ${m.label}`,
                            )
                          }
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            <button
              type="button"
              className="btn btn--dashed mt-2"
              onClick={() => {
                const item: MoneyIn = {
                  id: `in-${Date.now()}`,
                  label: 'Money from somewhere',
                  amount: 0,
                  owner: 'her',
                };
                setEditing(item.id);
                void persist(
                  { ...config, moneyIn: [...config.moneyIn, item] },
                  'Added money in',
                );
              }}
            >
              + one more
            </button>

            <Aside tilt={-1.5} className="mt-3">
              tap a name to change who it belongs to, or mark it uncertain
            </Aside>
          </Card>
        </>
      )}
    </Screen>
  );
}
