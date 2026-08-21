'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Screen, Card, Aside } from '@/components/Screen';
import { AmountField } from '@/components/AmountField';
import { PayerTag, PersonTag } from '@/components/Payer';
import type { CategoryDef, Phase } from '@/lib/config';
import { useConfig } from '@/lib/useConfig';
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
  const { config, setConfig, persist, saving, error, setError } = useConfig();
  const [members, setMembers] = useState<Member[]>([]);
  const [newCategory, setNewCategory] = useState('');
  const session = useSession();

  useEffect(() => {
    let cancelled = false;
    fetchMembers().then((m) => !cancelled && setMembers(m));
    return () => {
      cancelled = true;
    };
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
    const existing = config.food.categories.find((c) => c.id === id);
    if (existing && !existing.archived) {
      setError(`There is already a ${label} category.`);
      return;
    }
    if (existing?.archived) {
      // Bringing back one that was removed, rather than adding a duplicate id.
      setNewCategory('');
      void persist(
        {
          ...config,
          food: {
            ...config.food,
            categories: config.food.categories.map((c) =>
              c.id === id ? { id, label, archived: false } : c,
            ),
          },
        },
        `Brought back the ${label} category`,
      );
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
  }, [config, newCategory, persist, setError]);

  const removeCategory = useCallback(
    (c: CategoryDef) => {
      if (!config) return;
      void persist(
        {
          ...config,
  
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
          <Card title="Who&rsquo;s in">
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
          </Card>

          <Card title="When this starts">
            <div className="row">
              <span className="row-label">
                Move-in day
                <span className="row-meta block">
                  nothing is tracked before this, and its month is pro-rated to it
                </span>
              </span>
              <input
                type="date"
                aria-label="The day tracking starts"
                className="field text-[13px]"
                style={{ width: '8.5rem' }}
                value={config.startDate}
                onChange={(e) =>
                  void persist(
                    { ...config, startDate: e.target.value },
                    `Tracking starts ${e.target.value}`,
                  )
                }
              />
            </div>
            <div className="row">
              <span className="row-label">
                Month 0 of the plan
                <span className="row-meta block">
                  every line item&rsquo;s start month counts from here
                </span>
              </span>
              <input
                type="month"
                aria-label="First month of the plan"
                className="field text-[13px]"
                style={{ width: '8.5rem' }}
                value={config.startMonth}
                onChange={(e) =>
                  void persist(
                    { ...config, startMonth: e.target.value },
                    `Plan now starts ${e.target.value}`,
                  )
                }
              />
            </div>
            {config.startDate.slice(0, 7) !== config.startMonth && (
              <Aside tilt={-1.5} tint="gold" className="mt-2">
                move-in is in {config.startDate.slice(0, 7)} but the plan starts{' '}
                {config.startMonth} — bills will be due in the wrong months
              </Aside>
            )}
          </Card>

          <Card title="The goal">
            <div className="row">
              <span className="row-label">
                What you&rsquo;re saving for
                <span className="row-meta block">shown on Today and on Savings</span>
              </span>
              <input
                aria-label="What you are saving for"
                className="row-label max-w-[9rem] border-b bg-transparent text-right outline-none"
                style={{ borderColor: 'var(--rule)' }}
                value={config.savings.goalLabel}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    savings: { ...config.savings, goalLabel: e.target.value },
                  })
                }
                onBlur={(e) =>
                  void persist(
                    { ...config, savings: { ...config.savings, goalLabel: e.target.value } },
                    `Savings goal renamed to ${e.target.value}`,
                  )
                }
              />
            </div>
            <div className="row">
              <span className="row-label">
                Target
                <span className="row-meta block">zero hides the progress bar</span>
              </span>
              <AmountField
                label="Savings target"
                value={config.savings.goalAmount}
                onCommit={(v) =>
                  void persist(
                    { ...config, savings: { ...config.savings, goalAmount: v } },
                    `Savings target set to ${php(v)}`,
                  )
                }
              />
            </div>
            <Aside tilt={-1.5} className="mt-2">
              money only lands in savings when someone taps to bank it
            </Aside>
          </Card>

          <Card title="The side pot">
            <div className="row">
              <span className="row-label">
                What to call it
                <span className="row-meta block">
                  where an unspent day&rsquo;s limit goes
                </span>
              </span>
              <input
                aria-label="Name of the side pot"
                className="row-label max-w-[9rem] border-b bg-transparent text-right outline-none"
                style={{ borderColor: 'var(--rule)' }}
                value={config.pot.label}
                onChange={(e) =>
                  setConfig({ ...config, pot: { ...config.pot, label: e.target.value } })
                }
                onBlur={(e) =>
                  void persist(
                    { ...config, pot: { ...config.pot, label: e.target.value } },
                    `Side pot renamed to ${e.target.value}`,
                  )
                }
              />
            </div>
            <Aside tilt={-1.5} className="mt-2">
              a day that comes in under tips the rest in here rather than raising tomorrow
            </Aside>
          </Card>

          <Card title="Sharing">
            <div className="row">
              <span className="row-label">
                Default for a new log
                <span className="row-meta block">
                  you can still change it on any single purchase
                </span>
              </span>
              <button
                type="button"
                className="toggle"
                data-on={config.settlement.defaultShare === 'half'}
                aria-pressed={config.settlement.defaultShare === 'half'}
                aria-label="Split new entries 50/50 by default"
                onClick={() => {
                  const next = config.settlement.defaultShare === 'half' ? 'none' : 'half';
                  void persist(
                    { ...config, settlement: { ...config.settlement, defaultShare: next } },
                    `New entries default to ${next === 'half' ? '50/50' : 'unshared'}`,
                  );
                }}
              >
                <span className="toggle-knob" />
              </button>
            </div>
            <Aside tilt={-1.5} className="mt-2">
              {config.settlement.defaultShare === 'half'
                ? 'new purchases start as 50/50'
                : 'new purchases start as nobody owing anything'}
            </Aside>
          </Card>

          <Card title="The basics">
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
          </Card>

          <Card title="Phases" amount={`${months} months`}>
            {config.phases.map((p) => (
              <div
                key={p.id}
                className="mb-2.5 border p-3"
                style={{ borderColor: 'var(--rule)' }}
              >
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
          </Card>

          {/* Categories are the thing that used to need a migration to change. */}
          <Card
            title="Categories"
            amount={`${config.food.categories.filter((c) => !c.archived).length}`}
            className="mb-8"
          >
            <p className="tint-muted mb-2 text-[12.5px]">
              What a logged entry can be filed under. Removing one leaves entries already filed
              against it alone — they keep showing their old name.
            </p>

            {config.food.categories.filter((c) => !c.archived).map((c) => (
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
          </Card>

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
