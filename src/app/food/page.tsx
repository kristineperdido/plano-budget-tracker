'use client';

import { useCallback, useEffect, useState } from 'react';
import { AmountField } from '@/components/AmountField';
import { Row } from '@/components/Money';
import { Screen } from '@/components/Screen';
import type { Config, DayType } from '@/lib/config';
import { fetchConfig, logChange, saveConfig } from '@/lib/configStore';
import { foodForecast } from '@/lib/engine';
import { php } from '@/lib/model';

export default function FoodPage() {
  const [config, setConfig] = useState<Config | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    try {
      await saveConfig(next);
      await logChange(note);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
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
            dayTypes: config.food.dayTypes.map((d) => (d.id === id ? { ...d, ...patch } : d)),
          },
        },
        note,
      );
    },
    [config, persist],
  );

  if (error && !config) {
    return (
      <Screen title="Food">
        <p className="tint-brick mx-5 mt-4 text-[0.8rem]" role="alert">{error}</p>
      </Screen>
    );
  }

  if (!config) {
    return (
      <Screen title="Food">
        <p className="tint-muted serif px-5 py-16 text-center text-[0.9rem] italic">
          Adding it up…
        </p>
      </Screen>
    );
  }

  const f = foodForecast(config.food);
  const over = f.perMonth > f.budgetPerMonth;
  const weeks = config.food.dayTypes.reduce((s, d) => s + d.perWeek, 0);

  return (
    <Screen title="Food">
      {error && (
        <p className="tint-brick mx-5 mt-4 text-[0.8rem]" role="alert">{error}</p>
      )}

      <section className="px-5 pt-6">
        <div className="sheet px-5 py-5 text-center">
          <p className="stamp">Forecast</p>
          <p className={`num mt-2 text-[2.4rem] leading-none ${over ? 'tint-brick' : 'tint-green'}`}>
            {php(f.perDay)}
            <span className="tint-muted text-[0.9rem]">/day</span>
          </p>
          <p className="tint-muted serif mt-2 text-[0.82rem] italic">
            {php(f.foodPerDay)} meals + {php(f.coffeePerDay)} coffee
          </p>

          <div className="rule-dashed mt-4 pt-3 text-left">
            <Row label="Per month" amount={php(f.perMonth)} />
            <Row label="Budget" amount={php(f.budgetPerMonth)} />
            <div className="leader pt-1">
              <span className="text-[0.88rem]">{over ? 'Over by' : 'Under by'}</span>
              <span className="leader-fill" aria-hidden />
              <span className={`num text-[0.88rem] ${over ? 'tint-brick' : 'tint-green'}`}>
                {php(Math.abs(f.perMonth - f.budgetPerMonth))}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Day types */}
      <section className="px-5 pt-6">
        <h2 className="stamp mb-1">Day types</h2>
        {config.food.dayTypes.map((d) => (
          <div key={d.id} className="rule-dashed py-2 first:border-t-0">
            <div className="leader">
              <span className="text-[0.88rem]">{d.label}</span>
              <span className="leader-fill" aria-hidden />
              <AmountField
                label={`Cost per day for ${d.label}`}
                value={d.amount}
                onCommit={(v) => updateDayType(d.id, { amount: v }, `${d.label} set to ${php(v)}/day`)}
              />
            </div>
            <div className="mt-1 flex items-center gap-1.5">
              <label className="chip flex items-center gap-1">
                <AmountField
                  label={`Days per week for ${d.label}`}
                  prefix=""
                  width="1.6rem"
                  value={d.perWeek}
                  onCommit={(v) =>
                    updateDayType(d.id, { perWeek: Math.round(v) }, `${d.label} set to ${Math.round(v)} days/week`)
                  }
                />
                <span>days/week</span>
              </label>
              <span className="tint-muted text-[0.72rem]">
                {php(d.amount * d.perWeek)}/week
              </span>
            </div>
          </div>
        ))}
        {weeks !== 7 && (
          <p className="tint-gold mt-2 text-[0.75rem]">
            Days per week add up to {weeks}, not 7. The forecast still weights them
            proportionally, but the split probably isn&apos;t what you meant.
          </p>
        )}
      </section>

      {/* Coffee layer */}
      <section className="px-5 pt-6">
        <h2 className="stamp mb-1">Coffee</h2>
        <p className="tint-muted serif mb-1 text-[0.78rem] italic">
          A layer on top, independent of the day type. Sachet days cost nothing extra.
        </p>
        <div className="leader py-1.5">
          <span className="text-[0.88rem]">Per buy-out run</span>
          <span className="leader-fill" aria-hidden />
          <AmountField
            label="Cost per coffee run"
            value={config.food.coffee.cost}
            onCommit={(v) =>
              void persist(
                { ...config, food: { ...config.food, coffee: { ...config.food.coffee, cost: v } } },
                `Coffee run set to ${php(v)}`,
              )
            }
          />
        </div>
        <div className="leader py-1.5">
          <span className="text-[0.88rem]">Runs per week</span>
          <span className="leader-fill" aria-hidden />
          <AmountField
            label="Coffee runs per week"
            prefix=""
            width="2rem"
            value={config.food.coffee.perWeek}
            onCommit={(v) =>
              void persist(
                {
                  ...config,
                  food: {
                    ...config.food,
                    coffee: { ...config.food.coffee, perWeek: Math.round(v) },
                  },
                },
                `Coffee set to ${Math.round(v)} runs/week`,
              )
            }
          />
        </div>

        <p className="sheet mt-3 px-4 py-3 text-[0.82rem]">
          Each weekly run you skip saves{' '}
          <span className="num tint-green">{php(f.perSkippedCoffeeRun)}</span> a month.
          {over && (
            <>
              {' '}
              Dropping{' '}
              <span className="num">
                {Math.ceil((f.perMonth - f.budgetPerMonth) / f.perSkippedCoffeeRun)}
              </span>{' '}
              would bring the forecast under budget.
            </>
          )}
        </p>
      </section>

      {/* Budget basis */}
      <section className="px-5 pt-6">
        <h2 className="stamp mb-1">Budget basis</h2>
        <div className="leader py-1.5">
          <span className="text-[0.88rem]">Daily budget</span>
          <span className="leader-fill" aria-hidden />
          <AmountField
            label="Daily budget"
            value={config.food.dailyBudget}
            onCommit={(v) =>
              void persist(
                { ...config, food: { ...config.food, dailyBudget: v } },
                `Daily budget set to ${php(v)}`,
              )
            }
          />
        </div>
        <div className="leader py-1.5">
          <span className="text-[0.88rem]">Days per month</span>
          <span className="leader-fill" aria-hidden />
          <AmountField
            label="Days per month"
            prefix=""
            width="2rem"
            value={config.food.daysPerMonth}
            onCommit={(v) =>
              void persist(
                { ...config, food: { ...config.food, daysPerMonth: Math.round(v) } },
                `Days per month set to ${Math.round(v)}`,
              )
            }
          />
        </div>
      </section>
    </Screen>
  );
}
