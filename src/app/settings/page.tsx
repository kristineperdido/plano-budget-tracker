'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Screen, SectionLabel, Aside } from '@/components/Screen';
import { AmountField } from '@/components/AmountField';
import { PayerTag, PersonTag } from '@/components/Payer';
import type { CategoryDef, Config, Phase } from '@/lib/config';
import { fetchConfig, logChange, saveConfig } from '@/lib/configStore';
import { fetchMembers, type Member } from '@/lib/members';
import { totalMonths } from '@/lib/engine';
import { php } from '@/lib/model';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/components/AuthGate';

/** Category ids have to satisfy the database's slug constraint. */
function slugify(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
}

export default function SettingsPage() {
  const [config, setConfig] = useState<Config | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [newCategory, setNewCategory] = useState('');
  const session = useSession();

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchConfig(), fetchMembers()]).then(
      ([c, m]) => {
        if (cancelled) return;
        setConfig(c);
        setMembers(m);
      },
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

  const updatePhase = useCallback(
    (id: string, patch: Partial<Phase>, note: string) => {
      if (!config) return;
      void persist(
        { ...config, phases: config.phases.map((p) => (p.id === id ? { ...p, ...patch } : p)) },
        note,
      );
    },
    [config, persist],
  );

  const addCategory = useCallback(() => {
    if (!config) return;
    const label = newCategory.trim();
    if (!label) return;
    const id = slugify(label);
    if (!id) {
      setError('That name has no letters or numbers in it.');
      return;
    }
    if (config.food.categories.some((c) => c.id === id)) {
      setError(`There is already a ${label} category.`);
      return;
    }
    setNewCategory('');
    void persist(
      {
        ...config,
        food: { ...config.food, categories: [...config.food.categories, { id, label }] },
      },
      `Added the ${label} category`,
    );
  }, [config, newCategory, persist]);

  const removeCategory = useCallback(
    (c: CategoryDef) => {
      if (!config) return;
      void persist(
        {
          ...config,
          food: {
            ...config.food,
            categories: config.food.categories.filter((x) => x.id !== c.id),
          },
        },
        `Removed the ${c.label} category`,
      );
    },
    [config, persist],
  );

  const months = useMemo(() => (config ? totalMonths(config.phases) : 0), [config]);

  return (
    <Screen title="Settings" meta={saving ? 'saving…' : undefined}>
      {error && (
        <p className="tint-brick mt-4 text-[12.5px]" role="alert">
          {error}
        </p>
      )}

      {!config ? (
        <p className="empty py-16 text-center">reading the ledger…</p>
      ) : (
        <>
          <section>
            <SectionLabel>Who&rsquo;s in</SectionLabel>
            {members.map((m) => (
              <div key={m.email} className="row">
                <PersonTag person={m.email} me={session.user.email} members={members} />
                <span className="row-label">
                  <span className="num text-[12px]">{m.email}</span>
                </span>
                {m.email.toLowerCase() === session.user.email?.toLowerCase() && (
                  <span className="stamp stamp--muted">You</span>
                )}
              </div>
            ))}
            <Aside tilt={-1.5} className="mt-2">
              only these addresses can sign in — add one in Supabase
            </Aside>
          </section>

          <section>
            <SectionLabel>The basics</SectionLabel>
            <div className="row">
              <span className="row-label">
                Daily food allowance
                <span className="row-meta block">underspend rolls forward as buffer</span>
              </span>
              <AmountField
                label="Daily food allowance"
                value={config.food.dailyBudget}
                onCommit={(v) =>
                  void persist(
                    { ...config, food: { ...config.food, dailyBudget: v } },
                    `Daily allowance set to ${php(v)}`,
                  )
                }
              />
            </div>
            <div className="row">
              <span className="row-label">
                Days per month
                <span className="row-meta block">used for forecasts, not for the buffer</span>
              </span>
              <AmountField
                label="Days per month"
                prefix=""
                width="2.2rem"
                value={config.food.daysPerMonth}
                onCommit={(v) =>
                  void persist(
                    { ...config, food: { ...config.food, daysPerMonth: Math.round(v) } },
                    `Forecast month set to ${Math.round(v)} days`,
                  )
                }
              />
            </div>
            <Aside tilt={-1.5} className="mt-2">
              a day rolls over at midnight in Manila, wherever the phone thinks it is
            </Aside>
          </section>

          <section>
            <SectionLabel amount={`${months} months`}>Phases</SectionLabel>
            {config.phases.map((p) => (
              <div key={p.id} className="panel mb-2.5">
                <div className="flex items-center gap-2">
                  <input
                    aria-label={`Name of ${p.label}`}
                    className="sign min-w-0 flex-1 border-b border-transparent bg-transparent text-[14px] outline-none focus:border-[var(--ink)]"
                    value={p.label}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        phases: config.phases.map((x) =>
                          x.id === p.id ? { ...x, label: e.target.value } : x,
                        ),
                      })
                    }
                    onBlur={(e) =>
                      updatePhase(p.id, { label: e.target.value }, `Phase renamed to ${e.target.value}`)
                    }
                  />
                  <span className="tint-muted text-[11.5px]">months</span>
                  <AmountField
                    label={`Months in ${p.label}`}
                    prefix=""
                    width="2rem"
                    value={p.months}
                    onCommit={(v) =>
                      updatePhase(
                        p.id,
                        { months: Math.max(1, Math.round(v)) },
                        `${p.label} set to ${Math.max(1, Math.round(v))} months`,
                      )
                    }
                  />
                </div>

                <div className="row">
                  <PayerTag payer="her" />
                  <span className="row-label">Income per month</span>
                  <AmountField
                    label={`Tin's monthly income during ${p.label}`}
                    value={p.income.her}
                    onCommit={(v) =>
                      updatePhase(
                        p.id,
                        { income: { ...p.income, her: v } },
                        `${p.label}: tin earns ${php(v)}/mo`,
                      )
                    }
                  />
                </div>
                <div className="row">
                  <PayerTag payer="him" />
                  <span className="row-label">Income per month</span>
                  <AmountField
                    label={`Jhay's monthly income during ${p.label}`}
                    value={p.income.him}
                    onCommit={(v) =>
                      updatePhase(
                        p.id,
                        { income: { ...p.income, him: v } },
                        `${p.label}: jhay earns ${php(v)}/mo`,
                      )
                    }
                  />
                </div>
                <div className="row">
                  <PayerTag payer="her" />
                  <span className="row-label">Side hustle per month</span>
                  <AmountField
                    label={`Tin's side hustle during ${p.label}`}
                    value={p.income.herSideHustle}
                    onCommit={(v) =>
                      updatePhase(
                        p.id,
                        { income: { ...p.income, herSideHustle: v } },
                        `${p.label}: side hustle ${php(v)}/mo`,
                      )
                    }
                  />
                </div>

                {config.phases.length > 1 && (
                  <button
                    type="button"
                    className="chip tint-brick mt-2"
                    onClick={() =>
                      void persist(
                        { ...config, phases: config.phases.filter((x) => x.id !== p.id) },
                        `Removed the ${p.label} phase`,
                      )
                    }
                  >
                    Remove phase
                  </button>
                )}
              </div>
            ))}

            <button
              type="button"
              className="btn btn--dashed"
              onClick={() =>
                void persist(
                  {
                    ...config,
                    phases: [
                      ...config.phases,
                      {
                        id: `phase-${Date.now()}`,
                        label: 'New phase',
                        months: 1,
                        income: { her: 0, him: 0, herSideHustle: 0 },
                        payers: {},
                        foodPayer: 'split',
                      },
                    ],
                  },
                  'Added a phase',
                )
              }
            >
              + one more phase
            </button>
          </section>

          {/* Categories are the thing that used to need a migration to change. */}
          <section className="pb-8">
            <SectionLabel amount={`${config.food.categories.length}`}>Categories</SectionLabel>
            <p className="tint-muted mb-2 text-[12.5px]">
              What a logged entry can be filed under. Removing one leaves entries already filed
              against it alone — they keep showing their old name.
            </p>

            {config.food.categories.map((c) => (
              <div key={c.id} className="row">
                <span className="row-label">
                  {c.label}
                  <span className="row-meta block num">{c.id}</span>
                </span>
                <button
                  type="button"
                  onClick={() => removeCategory(c)}
                  aria-label={`Remove the ${c.label} category`}
                  className="tint-muted -my-2 px-2 py-3 text-[15px] leading-none"
                >
                  ×
                </button>
              </div>
            ))}

            <div className="mt-3 flex gap-2">
              <input
                className="field-text"
                placeholder="Transport, merienda, laundry…"
                aria-label="New category name"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addCategory();
                  }
                }}
              />
              <button
                type="button"
                className="btn btn--ghost"
                style={{ width: 'auto', padding: '12px 16px' }}
                onClick={addCategory}
                disabled={!newCategory.trim()}
              >
                Add
              </button>
            </div>
          </section>

          <button
            type="button"
            className="btn btn--outline-brick mb-8"
            onClick={() => void supabase.auth.signOut()}
          >
            Sign out
          </button>
        </>
      )}
    </Screen>
  );
}
