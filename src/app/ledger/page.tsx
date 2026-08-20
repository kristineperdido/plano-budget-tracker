'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AmountField } from '@/components/AmountField';
import { Screen } from '@/components/Screen';
import {
  PAYER_LABEL,
  type Config,
  type LineItem,
  type Payer,
} from '@/lib/config';
import { fetchConfig, logChange, saveConfig } from '@/lib/configStore';
import { php } from '@/lib/model';

const GROUPS: { key: LineItem['group']; title: string }[] = [
  { key: 'movein', title: 'Move-in' },
  { key: 'housing', title: 'Housing' },
  { key: 'living', title: 'Living' },
  { key: 'personal', title: 'Personal' },
];

const PAYERS: Payer[] = ['her', 'him', 'split', 'each'];

export default function LedgerPage() {
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
      const next = {
        ...config,
        items: config.items.map((i) => (i.id === id ? { ...i, ...patch } : i)),
      };
      void persist(next, note);
    },
    [config, persist],
  );

  const deleteItem = useCallback(
    (item: LineItem) => {
      if (!config) return;
      const next = { ...config, items: config.items.filter((i) => i.id !== item.id) };
      void persist(next, `Removed ${item.label}`);
    },
    [config, persist],
  );

  const addItem = useCallback(
    (group: LineItem['group']) => {
      if (!config) return;
      const item: LineItem = {
        id: `item-${Date.now()}`,
        label: 'New item',
        amount: 0,
        cadence: 'monthly',
        startMonth: 0,
        payer: 'split',
        group,
      };
      void persist({ ...config, items: [...config.items, item] }, 'Added a line item');
    },
    [config, persist],
  );

  const active = useMemo(() => config?.items.filter((i) => !i.pending) ?? [], [config]);

  return (
    <Screen
      title="Ledger"
      action={saving ? <span className="tint-muted text-[0.7rem]">saving…</span> : undefined}
    >
      {error && (
        <p className="tint-brick mx-5 mt-4 text-[0.8rem]" role="alert">
          {error}
        </p>
      )}

      {!config ? (
        <p className="tint-muted serif px-5 py-16 text-center text-[0.9rem] italic">
          Opening the ledger…
        </p>
      ) : (
        <>
          {GROUPS.map((g) => {
            const rows = active.filter((i) => i.group === g.key);
            return (
              <section key={g.key} className="px-5 pt-6">
                <div className="mb-1 flex items-baseline justify-between">
                  <h2 className="stamp">{g.title}</h2>
                  <button
                    type="button"
                    onClick={() => addItem(g.key)}
                    className="tint-muted text-[0.7rem] underline"
                  >
                    add
                  </button>
                </div>

                {rows.length === 0 && (
                  <p className="tint-muted serif py-2 text-[0.8rem] italic">Nothing here.</p>
                )}

                {rows.map((item) => (
                  <div key={item.id} className="rule-dashed py-2 first:border-t-0">
                    <div className="leader">
                      <input
                        aria-label={`Name of ${item.label}`}
                        className="min-w-0 flex-shrink border-b border-transparent bg-transparent text-[0.88rem] outline-none focus:border-[var(--ink)]"
                        value={item.label}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            items: config.items.map((i) =>
                              i.id === item.id ? { ...i, label: e.target.value } : i,
                            ),
                          })
                        }
                        onBlur={(e) => updateItem(item.id, { label: e.target.value }, `Renamed to ${e.target.value}`)}
                      />
                      <span className="leader-fill" aria-hidden />
                      <AmountField
                        label={`Amount for ${item.label}`}
                        value={item.amount}
                        onCommit={(v) => updateItem(item.id, { amount: v }, `${item.label} set to ${php(v)}`)}
                      />
                      <button
                        type="button"
                        aria-label={`Delete ${item.label}`}
                        onClick={() => deleteItem(item)}
                        className="tint-muted -my-2 px-1.5 py-2 text-[0.95rem] leading-none"
                      >
                        ×
                      </button>
                    </div>

                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        className="chip"
                        onClick={() =>
                          updateItem(
                            item.id,
                            { cadence: item.cadence === 'monthly' ? 'onetime' : 'monthly' },
                            `${item.label} is now ${item.cadence === 'monthly' ? 'one-time' : 'monthly'}`,
                          )
                        }
                      >
                        {item.cadence === 'monthly' ? 'monthly' : 'one-time'}
                      </button>

                      <select
                        aria-label={`Who pays for ${item.label}`}
                        className="chip"
                        value={item.payer}
                        onChange={(e) =>
                          updateItem(
                            item.id,
                            { payer: e.target.value as Payer },
                            `${item.label} payer set to ${PAYER_LABEL[e.target.value as Payer]}`,
                          )
                        }
                      >
                        {PAYERS.map((p) => (
                          <option key={p} value={p}>
                            {PAYER_LABEL[p]}
                          </option>
                        ))}
                      </select>

                      <label className="chip flex items-center gap-1">
                        <span>from month</span>
                        <AmountField
                          label={`Start month for ${item.label}`}
                          prefix=""
                          width="1.6rem"
                          value={item.startMonth}
                          onCommit={(v) =>
                            updateItem(item.id, { startMonth: Math.round(v) }, `${item.label} starts month ${Math.round(v)}`)
                          }
                        />
                      </label>
                    </div>

                    {item.note && (
                      <p className="tint-muted mt-1 text-[0.72rem] italic">{item.note}</p>
                    )}
                  </div>
                ))}
              </section>
            );
          })}

          {/* Money in */}
          <section className="px-5 pt-8">
            <h2 className="stamp mb-1">Money in</h2>
            {config.moneyIn.map((m) => (
              <div key={m.id} className="rule-dashed py-2 first:border-t-0">
                <div className="leader">
                  <span className="text-[0.88rem]">
                    {m.label}
                    {m.uncertain && <span className="tint-gold"> · uncertain</span>}
                    {m.backup && <span className="tint-muted"> · backup</span>}
                  </span>
                  <span className="leader-fill" aria-hidden />
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
                {m.note && <p className="tint-muted mt-0.5 text-[0.72rem] italic">{m.note}</p>}
              </div>
            ))}
          </section>
        </>
      )}
    </Screen>
  );
}
