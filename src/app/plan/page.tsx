'use client';

import { useEffect, useMemo, useState } from 'react';
import { Row, Signed } from '@/components/Money';
import { Screen } from '@/components/Screen';
import type { Config } from '@/lib/config';
import { fetchConfig } from '@/lib/configStore';
import { computePlan, foodForecast, totalMonths } from '@/lib/engine';
import { addDays, todayISO } from '@/lib/date';
import { fetchEntries } from '@/lib/entries';
import { php } from '@/lib/model';
import type { FoodEntry } from '@/lib/types';

export default function PlanPage() {
  const [config, setConfig] = useState<Config | null>(null);
  const [entries, setEntries] = useState<FoodEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [includeUncertain, setIncludeUncertain] = useState(true);
  const [includePending, setIncludePending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const today = todayISO();
    Promise.all([fetchConfig(), fetchEntries(addDays(today, -29), today)]).then(
      ([c, e]) => {
        if (cancelled) return;
        setConfig(c);
        setEntries(e);
      },
      (err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load.');
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const plan = useMemo(
    () => (config ? computePlan(config, { includeUncertain, includePending }) : null),
    [config, includeUncertain, includePending],
  );

  // Actual vs forecast: what the last 30 days of logging says about the
  // forecast the whole plan rests on.
  const pace = useMemo(() => {
    if (!config || entries.length === 0) return null;
    const days = new Set(entries.map((e) => e.spent_on)).size;
    const spent = entries.reduce((s, e) => s + e.amount, 0);
    const actualPerDay = spent / days;
    const forecast = foodForecast(config.food);
    return {
      days,
      actualPerDay,
      forecastPerDay: forecast.perDay,
      delta: actualPerDay - forecast.perDay,
      monthlyDelta: (actualPerDay - forecast.perDay) * config.food.daysPerMonth,
    };
  }, [config, entries]);

  return (
    <Screen title="Plan">
      {error && (
        <p className="tint-brick mx-5 mt-4 text-[0.8rem]" role="alert">
          {error}
        </p>
      )}

      {!plan || !config ? (
        <p className="tint-muted serif px-5 py-16 text-center text-[0.9rem] italic">
          Working the numbers…
        </p>
      ) : (
        <>
          <section className="px-5 pt-6">
            <div className="sheet px-5 py-5">
              <p className="stamp text-center">
                {totalMonths(config.phases)} months ·{' '}
                {config.phases.map((p) => p.label).join(' → ')}
              </p>

              <div className="mt-4">
                <Row label="Her" amount={<Signed value={plan.net.her} />} strong />
                <Row label="Him" amount={<Signed value={plan.net.him} />} strong />
              </div>

              <div className="rule-dashed mt-2 pt-2">
                <div className="leader">
                  <span className="serif text-[0.95rem]">Combined</span>
                  <span className="leader-fill" aria-hidden />
                  <Signed value={plan.combined} size="1.15rem" />
                </div>
              </div>

              {plan.backup.him + plan.backup.her > 0 && (
                <p className="tint-muted mt-3 text-center text-[0.75rem]">
                  plus {php(plan.backup.him + plan.backup.her)} savings held as backup
                </p>
              )}
            </div>
          </section>

          <section className="flex gap-2 px-5 pt-4">
            <button
              type="button"
              className="chip flex-1"
              data-on={includeUncertain}
              aria-pressed={includeUncertain}
              onClick={() => setIncludeUncertain((v) => !v)}
            >
              Uncertain money
            </button>
            <button
              type="button"
              className="chip flex-1"
              data-on={includePending}
              aria-pressed={includePending}
              onClick={() => setIncludePending((v) => !v)}
            >
              Pending items
            </button>
          </section>

          <section className="px-5 pt-6">
            <h2 className="stamp mb-1">Where it goes</h2>
            <Row label="Her costs" amount={php(plan.costs.her)} />
            <Row label="His costs" amount={php(plan.costs.him)} />
            <Row
              label="Food (both)"
              sub={`${php(plan.food.perMonth)}/month forecast`}
              amount={php(plan.food.total)}
            />
            <div className="rule-dashed mt-2 pt-2">
              <Row label="Her income + savings" amount={php(plan.income.her + plan.moneyIn.her)} />
              <Row label="His income" amount={php(plan.income.him + plan.moneyIn.him)} />
            </div>
          </section>

          <section className="px-5 pt-6">
            <h2 className="stamp mb-1">Actual vs forecast</h2>
            {!pace ? (
              <p className="tint-muted serif py-2 text-[0.85rem] italic">
                Nothing logged yet — the forecast is still just a forecast.
              </p>
            ) : (
              <>
                <Row
                  label="Logged"
                  sub={`over ${pace.days} ${pace.days === 1 ? 'day' : 'days'} with entries`}
                  amount={`${php(pace.actualPerDay)}/day`}
                />
                <Row label="Forecast" amount={`${php(pace.forecastPerDay)}/day`} />
                <div className="rule-dashed mt-2 pt-2">
                  <div className="leader">
                    <span className="text-[0.88rem]">
                      {pace.delta > 0 ? 'Running over' : 'Running under'}
                    </span>
                    <span className="leader-fill" aria-hidden />
                    <span
                      className={`num text-[0.88rem] ${pace.delta > 0 ? 'tint-brick' : 'tint-green'}`}
                    >
                      {php(Math.abs(pace.monthlyDelta))}/mo
                    </span>
                  </div>
                </div>
              </>
            )}
          </section>
        </>
      )}
    </Screen>
  );
}
