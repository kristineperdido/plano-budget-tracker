'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AmountField } from '@/components/AmountField';
import { Screen, Aside } from '@/components/Screen';
import { Tally } from '@/components/Tally';
import type { Config, DayType, Extra } from '@/lib/config';
import { fetchConfig, logChange, saveConfig } from '@/lib/configStore';
import { foodForecast } from '@/lib/engine';
import { php } from '@/lib/model';

export default function FoodPage() {
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

  const updateDayType = useCallback(
    (id: string, patch: Partial<DayType>, note: string) => {
      if (!config) return;
      void persist(
        {
          ...config,
          food: {
            ...config.food,
            dayTypes: config.food.dayTypes.map((t) => (t.id === id ? { ...t, ...patch } : t)),
          },
        },
        note,
      );
    },
    [config, persist],
  );

  const updateExtra = useCallback(
    (id: string, patch: Partial<Extra>, note: string) => {
      if (!config) return;
      void persist(
        {
          ...config,
          food: {
            ...config.food,
            extras: config.food.extras.map((e) => (e.id === id ? { ...e, ...patch } : e)),
          },
        },
        note,
      );
    },
    [config, persist],
  );

  const f = useMemo(() => (config ? foodForecast(config.food) : null), [config]);
  const over = f ? f.perDay > (config?.food.dailyBudget ?? 0) : false;
  const gap = f ? Math.abs(f.perDay - (config?.food.dailyBudget ?? 0)) : 0;
  const weekDays = config?.food.dayTypes.reduce((s, t) => s + t.perWeek, 0) ?? 0;

  return (
    <Screen
      title="Food"
      meta={
        saving ? (
          <span className="marker tint-gold text-[17px]">saving…</span>
        ) : f ? (
          over ? 'over' : 'within'
        ) : undefined
      }
    >
      {error && (
        <p className="tint-brick mt-4 text-[12.5px]" role="alert">
          {error}
        </p>
      )}

      {!config || !f ? (
        <p className="empty py-16 text-center">working the numbers…</p>
      ) : (
        <>
          <section className="relative pt-5 pb-3 text-center">
            <p className="sign-label tint-teal" style={{ letterSpacing: '0.2em' }}>
              Forecast per day
            </p>
            <p className={`num num-forecast mt-2 ${over ? 'tint-brick' : 'tint-green'}`}>
              {php(f.perDay)}
            </p>
            <Aside
              tilt={4}
              tint={over ? 'brick' : 'green'}
              className="absolute right-0 top-[76px] text-left"
            >
              {over ? `${php(gap)} over` : `${php(gap)} spare`}
            </Aside>
            <p className="tint-muted mt-3 text-[12.5px] leading-[1.5]">
              {php(f.foodPerDay)} meals
              {f.extras.length > 0 && ` + ${php(f.extrasPerDay)} extras`}
              <br />
              {php(f.perMonth)}/mo vs {php(f.budgetPerMonth)}
            </p>
          </section>

          {/* The week, as it is actually lived. */}
          <div className="panel mt-3">
            <span className="tape" style={{ left: 24 }} aria-hidden />
            <div className="leader mb-2">
              <h2 className="sign-label tint-teal">One week</h2>
              <span className="leader-fill" aria-hidden />
              <span className="num text-[13px]">{weekDays} days</span>
            </div>

            {config.food.dayTypes.map((t) => (
              <div key={t.id} className="mb-3 last:mb-0">
                <div className="flex items-center gap-2">
                  <input
                    aria-label={`Name of ${t.label}`}
                    className="row-label min-w-0 border-b border-transparent bg-transparent outline-none focus:border-[var(--ink)]"
                    value={t.label}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        food: {
                          ...config.food,
                          dayTypes: config.food.dayTypes.map((x) =>
                            x.id === t.id ? { ...x, label: e.target.value } : x,
                          ),
                        },
                      })
                    }
                    onBlur={(e) =>
                      updateDayType(t.id, { label: e.target.value }, `Day type renamed to ${e.target.value}`)
                    }
                  />
                  <AmountField
                    label={`Cost of a ${t.label} day`}
                    value={t.amount}
                    onCommit={(v) => updateDayType(t.id, { amount: v }, `${t.label} set to ${php(v)}`)}
                  />
                </div>
                <div className="mt-1 flex items-center gap-2.5">
                  <Tally count={t.perWeek} max={7} />
                  <span className="flex-1" />
                  <span className="tint-muted text-[11.5px]">days a week</span>
                  <AmountField
                    label={`${t.label} days per week`}
                    prefix=""
                    width="1.8rem"
                    value={t.perWeek}
                    onCommit={(v) =>
                      updateDayType(
                        t.id,
                        { perWeek: Math.round(v) },
                        `${t.label} set to ${Math.round(v)} days a week`,
                      )
                    }
                  />
                </div>
              </div>
            ))}

            <div className="leader mt-3 border-t pt-2.5" style={{ borderColor: 'var(--rule)' }}>
              <span className="sign-label">Weighted</span>
              <span className="leader-fill" aria-hidden />
              <span className="num text-[14px]">{php(f.foodPerDay)}/day</span>
            </div>

            {weekDays !== 7 && (
              <Aside tilt={-1.5} tint="gold" className="mt-2">
                {weekDays} days a week, not 7 — the average is weighted, not wrong
              </Aside>
            )}
          </div>

          {/* Extras are an independent layer, not a kind of day. */}
          <section className="pb-8">
            <div className="leader mt-7 mb-1">
              <h2 className="sign-label tint-teal">Extras — separate</h2>
              <span className="leader-fill" aria-hidden />
              <span className="num text-[13px]">{php(f.extrasPerDay)}/day</span>
            </div>

            {f.extras.length === 0 && <p className="empty py-3">no extras on top</p>}

            {f.extras.map((e) => (
              <div key={e.id} className="panel mb-2.5">
                <div className="flex items-center gap-2">
                  <input
                    aria-label={`Name of ${e.label}`}
                    className="row-label min-w-0 border-b border-transparent bg-transparent outline-none focus:border-[var(--ink)]"
                    value={e.label}
                    onChange={(ev) =>
                      setConfig({
                        ...config,
                        food: {
                          ...config.food,
                          extras: config.food.extras.map((x) =>
                            x.id === e.id ? { ...x, label: ev.target.value } : x,
                          ),
                        },
                      })
                    }
                    onBlur={(ev) =>
                      updateExtra(e.id, { label: ev.target.value }, `Extra renamed to ${ev.target.value}`)
                    }
                  />
                  <AmountField
                    label={`Cost per ${e.label} run`}
                    value={e.cost}
                    onCommit={(v) => updateExtra(e.id, { cost: v }, `${e.label} set to ${php(v)} a run`)}
                  />
                </div>

                <div className="mt-1.5 flex items-center gap-2.5">
                  <Tally count={e.perWeek} tint="gold" max={7} />
                  <span className="flex-1" />
                  <span className="tint-muted text-[11.5px]">runs a week</span>
                  <AmountField
                    label={`${e.label} runs per week`}
                    prefix=""
                    width="1.8rem"
                    value={e.perWeek}
                    onCommit={(v) =>
                      updateExtra(
                        e.id,
                        { perWeek: Math.round(v) },
                        `${e.label} set to ${Math.round(v)} runs a week`,
                      )
                    }
                  />
                </div>

                <p className="tint-muted mt-1.5 text-[11.5px]">
                  {e.perWeek} {e.perWeek === 1 ? 'run' : 'runs'} → {php(e.perDay)}/day
                </p>

                {e.perWeek > 0 && (
                  <Aside tilt={-2} tint="green" className="mt-1.5">
                    drop one a week → save {php(e.perSkippedRun)} a month
                  </Aside>
                )}

                <button
                  type="button"
                  className="chip tint-brick mt-2.5"
                  onClick={() =>
                    void persist(
                      {
                        ...config,
                        food: {
                          ...config.food,
                          extras: config.food.extras.filter((x) => x.id !== e.id),
                        },
                      },
                      `Removed the ${e.label} extra`,
                    )
                  }
                >
                  Remove
                </button>
              </div>
            ))}

            <button
              type="button"
              className="btn btn--dashed mt-2"
              onClick={() =>
                void persist(
                  {
                    ...config,
                    food: {
                      ...config.food,
                      extras: [
                        ...config.food.extras,
                        {
                          id: `extra-${Date.now()}`,
                          label: 'New extra',
                          cost: 0,
                          perWeek: 1,
                        },
                      ],
                    },
                  },
                  'Added a recurring extra',
                )
              }
            >
              + one more extra
            </button>

            {over && (
              <Aside tilt={-1} tint="brick" className="mt-4">
                {php((f.perMonth - f.budgetPerMonth) / config.food.daysPerMonth)}/day over the
                allowance
              </Aside>
            )}
          </section>
        </>
      )}
    </Screen>
  );
}
