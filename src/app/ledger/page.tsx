'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AmountField } from '@/components/AmountField';
import { Screen, Card, Aside } from '@/components/Screen';
import { PayerTag } from '@/components/Payer';
import { FoodEditor } from '@/components/FoodEditor';
import {
  PAYER_DESCRIPTION,
  PAYER_LABEL,
  type MoneyIn,
  type Cadence,
  type LineItem,
  type Payer,
} from '@/lib/config';
import { logChange } from '@/lib/configStore';
import { schemesWith, type Scheme } from '@/lib/config';
import { useConfig } from '@/lib/useConfig';
import { foodForecast, householdCost } from '@/lib/engine';
import { fetchBills, recordBill, type BillPayment } from '@/lib/bills';
import { billsDueIn, monthOf } from '@/lib/close';
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
  /** "Aug 26" — short enough to sit on one line beside the field. */
  const shortMonth = (m: string) => {
    const names = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const [y, mm] = m.split('-').map(Number);
    return `${names[mm - 1]} ${String(y).slice(2)}`;
  };

  const billMonth = useCallback(
    (item: LineItem) =>
      item.cadence === 'onetime' && config
        ? monthOfIndex(config.startMonth, item.startMonth)
        : thisMonth,
    [config, thisMonth],
  );

  /**
   * Whether this item can have a figure recorded right now. The month has to be
   * one the plan covers: before it began, `billsDueIn` returns nothing, so a
   * figure typed here would be written against a month the month-close never
   * reads and would sit orphaned in the table forever.
   */
  const recordable = useCallback(
    (item: LineItem) =>
      Boolean(config) && billsDueIn(config!, billMonth(item)).some((i) => i.id === item.id),
    [config, billMonth],
  );

  const actualFor = useCallback(
    (item: LineItem) =>
      bills.find((b) => b.item_id === item.id && b.for_month === billMonth(item))?.amount ?? null,
    [bills, billMonth],
  );

  const [savingBill, setSavingBill] = useState(false);
  /** Which row has been opened to type a figure it does not have yet. */
  const [recording, setRecording] = useState<string | null>(null);
  /** Which scheme the Ledger is editing. Defaults to the first. */
  const [schemeId, setSchemeId] = useState<string | null>(null);
  /** A change just saved that could also be applied to the other schemes. */
  const [spread, setSpread] = useState<{ itemId: string; label: string; patch: Partial<LineItem> } | null>(null);
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

  const scheme: Scheme | null = config
    ? (config.schemes.find((s) => s.id === schemeId) ?? config.schemes[0])
    : null;

  /** Replace the active scheme's lines. */
  const writeScheme = useCallback(
    (items: LineItem[], note: string) => {
      if (!config || !scheme) return;
      void persist(
        {
          ...config,
          schemes: config.schemes.map((s) => (s.id === scheme.id ? { ...s, items } : s)),
        },
        note,
      );
    },
    [config, scheme, persist],
  );

  const updateItem = useCallback(
    (id: string, patch: Partial<LineItem>, note: string) => {
      if (!config || !scheme) return;
      writeScheme(
        scheme.items.map((i) => (i.id === id ? { ...i, ...patch } : i)),
        note,
      );
      // Offer to carry it across, rather than deciding on the user's behalf.
      // Editing one scheme is the common case; editing all of them is the one
      // that is tedious to do by hand.
      const alsoIn = schemesWith(config, id).filter((s) => s.id !== scheme.id);
      const isTerms = 'amount' in patch || 'payer' in patch || 'cadence' in patch || 'startMonth' in patch;
      if (alsoIn.length > 0 && isTerms) {
        setSpread({ itemId: id, label: scheme.items.find((i) => i.id === id)?.label ?? '', patch });
      }
    },
    [config, scheme, writeScheme],
  );

  /** Apply the change just made to every other scheme that has this line. */
  const applyEverywhere = useCallback(() => {
    if (!config || !spread || !scheme) return;
    void persist(
      {
        ...config,
        schemes: config.schemes.map((s) => ({
          ...s,
          items: s.items.map((i) => (i.id === spread.itemId ? { ...i, ...spread.patch } : i)),
        })),
      },
      `${spread.label} changed in every scheme`,
    );
    setSpread(null);
  }, [config, spread, scheme, persist]);

  const deleteItem = useCallback(
    (item: LineItem) => {
      if (!scheme) return;
      writeScheme(
        scheme.items.filter((i) => i.id !== item.id),
        `Removed ${item.label} from ${scheme.label}`,
      );
    },
    [scheme, writeScheme],
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
      if (!scheme) return;
      writeScheme([...scheme.items, item], `Added ${item.label} to ${scheme.label}`);
    },
    [config, scheme, writeScheme],
  );

  const active = useMemo(() => scheme?.items ?? [], [scheme]);
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

      {!config || !scheme ? (
        <p className="empty py-16 text-center">opening the ledger…</p>
      ) : (
        <>
          {/* Which scheme is being edited. A phase points at one of these, so
              the same cost can be priced or paid differently in each stretch of
              the plan without forking its identity. */}
          {config.schemes.length > 0 && (
            <Card title="Scheme" amount={`${config.schemes.length}`}>
              <p className="row-meta -mt-1 mb-2">
                editing one set of terms · phases choose which applies
              </p>
              <div className="flex flex-wrap gap-1.5">
                {config.schemes.map((sc) => {
                  const used = config.phases.filter((p) => p.schemeId === sc.id).length;
                  return (
                    <button
                      key={sc.id}
                      type="button"
                      className="chip"
                      data-on={sc.id === scheme.id}
                      aria-pressed={sc.id === scheme.id}
                      onClick={() => setSchemeId(sc.id)}
                    >
                      {sc.label}
                      {used > 0 && ` · ${used}`}
                    </button>
                  );
                })}
              </div>

              <div className="mt-2 flex items-center gap-2">
                <input
                  aria-label="Name of this scheme"
                  className="name-field"
                  value={scheme.label}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      schemes: config.schemes.map((sc) =>
                        sc.id === scheme.id ? { ...sc, label: e.target.value } : sc,
                      ),
                    })
                  }
                  onBlur={(e) =>
                    void persist(
                      {
                        ...config,
                        schemes: config.schemes.map((sc) =>
                          sc.id === scheme.id ? { ...sc, label: e.target.value } : sc,
                        ),
                      },
                      `Scheme renamed to ${e.target.value}`,
                    )
                  }
                />
                {config.schemes.length > 1 &&
                  !config.phases.some((p) => p.schemeId === scheme.id) && (
                    <button
                      type="button"
                      className="tap-target"
                      onClick={() => {
                        setSchemeId(config.schemes.find((sc) => sc.id !== scheme.id)!.id);
                        void persist(
                          {
                            ...config,
                            schemes: config.schemes.filter((sc) => sc.id !== scheme.id),
                          },
                          `Removed the ${scheme.label} scheme`,
                        );
                      }}
                    >
                      <span className="chip chip--sm tint-brick whitespace-nowrap">Remove</span>
                    </button>
                  )}
              </div>

              <button
                type="button"
                className="btn btn--dashed"
                onClick={() => {
                  // Copied, not blank: the lines keep their ids, which is what
                  // keeps recorded figures resolving across schemes.
                  const id = `scheme-${Date.now()}`;
                  setSchemeId(id);
                  void persist(
                    {
                      ...config,
                      schemes: [
                        ...config.schemes,
                        { id, label: `${scheme.label} (copy)`, items: scheme.items.map((i) => ({ ...i })) },
                      ],
                    },
                    `Added a scheme based on ${scheme.label}`,
                  );
                }}
              >
                + copy this one
              </button>

              {config.phases.some((p) => p.schemeId === scheme.id) ? (
                <p className="row-meta mt-2">
                  used by{' '}
                  {config.phases
                    .filter((p) => p.schemeId === scheme.id)
                    .map((p) => p.label)
                    .join(', ')}
                </p>
              ) : (
                <Aside tilt={-1.5} tint="gold" className="mt-2">
                  no phase uses this one yet — pick it in Settings
                </Aside>
              )}
            </Card>
          )}

          {/* Both options, at the moment of editing, rather than a rule chosen
              once and applied silently forever. */}
          {spread && (
            <Card>
              <p className="text-[13.5px]">
                {spread.label} changed in <strong>{scheme.label}</strong>. It also appears in{' '}
                {schemesWith(config, spread.itemId).length - 1} other scheme
                {schemesWith(config, spread.itemId).length - 1 === 1 ? '' : 's'}.
              </p>
              <div className="mt-2.5 flex gap-2">
                <button type="button" className="chip flex-1" onClick={() => setSpread(null)}>
                  This scheme only
                </button>
                <button type="button" className="chip flex-1" onClick={applyEverywhere}>
                  Apply everywhere
                </button>
              </div>
            </Card>
          )}

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

                        <span className="row-label min-w-0">
                        <input
                          aria-label={`Name of ${item.label}`}
                          className="name-field"
                          value={item.label}
                          onChange={(e) =>
                            setConfig({
                              ...config,
                              schemes: config.schemes.map((sc) =>
                                sc.id === scheme.id
                                  ? {
                                      ...sc,
                                      items: sc.items.map((i) =>
                                        i.id === item.id ? { ...i, label: e.target.value } : i,
                                      ),
                                    }
                                  : sc,
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
                        {/* Inside the row, so it sits above the dotted divider
                            rather than pressed against it. */}
                        {item.note && !open && <span className="row-note">{item.note}</span>}
                        </span>

                        <AmountField
                          label={`Amount for ${item.label}`}
                          value={item.amount}
                          onCommit={(v) =>
                            updateItem(item.id, { amount: v }, `${item.label} set to ${php(v)}`)
                          }
                        />
                      </div>



                      {/* What it actually came to. Only monthly bills vary
                          enough to be worth chasing month by month. */}
                      {recordable(item) && (
                        <div className="mb-1.5 flex items-center gap-2 pl-[61px]">
                          <span className="row-status flex-1">
                            {(() => {
                              const actual = actualFor(item);
                              // Just the month when there is nothing yet — the
                              // button beside it says what is missing, and the
                              // two together overflowed the card.
                              if (actual === null) return shortMonth(billMonth(item));
                              const diff = item.amount - actual;
                              if (Math.abs(diff) < 0.5) return `${shortMonth(billMonth(item))} — as planned`;
                              return (
                                <>
                                  {shortMonth(billMonth(item))} —{' '}
                                  <span className={diff > 0 ? 'tint-green' : 'tint-brick'}>
                                    {php(Math.abs(diff))} {diff > 0 ? 'under' : 'over'}
                                  </span>
                                </>
                              );
                            })()}
                          </span>
                          {/* A field pre-filled with the planned amount looks
                              like a figure that has been recorded. Until one
                              actually has been, this is a button that says what
                              it does. */}
                          {actualFor(item) === null && recording !== item.id ? (
                            <button
                              type="button"
                              className="tap-target"
                              onClick={() => setRecording(item.id)}
                            >
                              <span className="chip chip--sm whitespace-nowrap">Record</span>
                            </button>
                          ) : (
                            <>
                              <span className="tint-muted whitespace-nowrap text-[11px]">
                                came to
                              </span>
                              <AmountField
                                label={`What ${item.label} came to in ${billMonth(item)}`}
                                value={actualFor(item) ?? item.amount}
                                onCommit={(v) => void saveActual(item, v)}
                              />
                            </>
                          )}
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
                              schemes: config.schemes.map((sc) =>
                                sc.id === scheme.id
                                  ? {
                                      ...sc,
                                      items: sc.items.map((i) =>
                                        i.id === item.id ? { ...i, note: e.target.value } : i,
                                      ),
                                    }
                                  : sc,
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

          {/* Food sits with the other costs rather than behind a screen of its
              own: it is the largest recurring line in the plan, and the day
              types that produce it are the thing you actually adjust. */}
          {forecast && (
            <Card title="Food" amount={`${php(forecast.perMonth)}/mo`}>
              <FoodEditor config={config} setConfig={setConfig} persist={persist} />
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

                    {/* The stamps used to sit on this line, competing with the
                        name for width, so a longer name was simply cut off.
                        They belong with the note underneath. */}
                    <span className="row-label min-w-0">
                      <input
                        aria-label={`Name of ${m.label}`}
                        className="name-field"
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

                      {(m.uncertain || m.backup || (m.note && !open)) && (
                        <span className="mt-1 flex flex-wrap items-center gap-1.5">
                          {m.uncertain && <span className="stamp stamp--gold">Uncertain</span>}
                          {m.backup && <span className="stamp stamp--muted">Backup</span>}
                          {m.note && !open && <span className="row-note">{m.note}</span>}
                        </span>
                      )}
                    </span>

                    <AmountField
                      label={`Amount for ${m.label}`}
                      value={m.amount}
                      onCommit={(v) => patch({ amount: v }, `${m.label} set to ${php(v)}`)}
                    />
                  </div>

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
