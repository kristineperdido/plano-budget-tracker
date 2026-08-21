'use client';

import { useEffect, useMemo, useState } from 'react';
import { Row, Signed } from '@/components/Money';
import { Screen, Card, Aside } from '@/components/Screen';
import { PayerMark, PayerTag } from '@/components/Payer';
import type { Config } from '@/lib/config';
import { fetchConfig } from '@/lib/configStore';
import { computePlan, foodForecast, totalMonths, phaseOf } from '@/lib/engine';
import { computeCashflow } from '@/lib/cashflow';
import { CashflowPanel } from '@/components/Cashflow';
import { addDays, todayISO, monthIndexOf } from '@/lib/date';
import { fetchEntries } from '@/lib/entries';
import { php } from '@/lib/model';
import type { FoodEntry } from '@/lib/types';

export default function PlanPage() {
  const [config, setConfig] = useState<Config | null>(null);
  const [entries, setEntries] = useState<FoodEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Off by default. Counting the brother's repayment as money in hand is what
  // made the headline read +8,998 while the committed position was short.
  const [includeUncertain, setIncludeUncertain] = useState(false);
  const [includePending, setIncludePending] = useState(false);
  const [viewPhase, setViewPhase] = useState<string | null>(null);

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

  // Which month of the timeline today actually falls in, so "where you are" is
  // a fact rather than a guess.
  const currentMonth = useMemo(
    () => (config ? monthIndexOf(config.startMonth, todayISO()) : 0),
    [config],
  );
  const currentPhase = config ? phaseOf(config.phases, currentMonth) : null;
  const activePhaseId = viewPhase ?? currentPhase?.id ?? config?.phases[0]?.id ?? null;

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

  const months = config ? totalMonths(config.phases) : 0;
  const flow = useMemo(() => (config ? computeCashflow(config) : null), [config]);

  return (
    <Screen title="Plan" meta={plan ? `${months} months` : undefined}>
      {error && (
        <p className="tint-brick mt-4 text-[12.5px]" role="alert">
          {error}
        </p>
      )}

      {!plan || !config ? (
        <p className="empty py-16 text-center">working the numbers…</p>
      ) : (
        <>
          {/* Phases as a strip of chips — the timeline is a first-class list. */}
          <Card title="Where you are">
            <div className="flex flex-wrap items-stretch gap-1.5">
              {config.phases.map((p) => {
                const on = p.id === activePhaseId;
                return (
                  <button
                    key={p.id}
                    type="button"
                    className="chip"
                    data-on={on}
                    aria-pressed={on}
                    style={on ? { transform: 'rotate(-0.8deg)' } : undefined}
                    onClick={() => setViewPhase(p.id)}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
            <Aside tilt={-1.5} className="mt-2">
              {currentPhase
                ? `month ${currentMonth + 1} of ${months} — ${currentPhase.label.toLowerCase()}`
                : `${months} months mapped, starting ${config.startMonth}`}
            </Aside>
          </Card>

          {/* The score. */}
          <div className="panel mt-4">
            <span className="tape" style={{ left: 26 }} aria-hidden />
            <div className="flex gap-3">
              {(['her', 'him'] as const).map((who) => (
                <div key={who} className="flex-1">
                  <PayerTag payer={who} fixed={false} />
                  <div className="mt-1.5">
                    <Signed value={plan.net[who]} size="20px" />
                  </div>
                </div>
              ))}
            </div>

            <div className="leader mt-4 border-t pt-3" style={{ borderColor: 'var(--rule)' }}>
              <span className="sign-label">Combined</span>
              <span className="leader-fill" aria-hidden />
              <Signed value={plan.combined} size="27px" />
            </div>

            {plan.backup.him + plan.backup.her > 0 && (
              <Aside tilt={-1.5} className="mt-2">
                + {php(plan.backup.him + plan.backup.her)} savings, untouched
              </Aside>
            )}
          </div>

          <div className="mt-4 flex gap-2">
            <button
              type="button"
              className="chip flex-1"
              data-on={includeUncertain}
              aria-pressed={includeUncertain}
              onClick={() => setIncludeUncertain((v) => !v)}
            >
              Uncertain money {includeUncertain ? 'on' : 'off'}
            </button>
            <button
              type="button"
              className="chip flex-1"
              data-on={includePending}
              aria-pressed={includePending}
              onClick={() => setIncludePending((v) => !v)}
            >
              Pending items {includePending ? 'on' : 'off'}
            </button>
          </div>

          {flow && <CashflowPanel flow={flow} potLabel={config.pot.label} />}

          {/* Items whose start month falls outside the plan are charged to
              nothing at all. Silence there let a 9,999/month cost move the net
              by zero, so they are named rather than quietly dropped. */}
          {plan.orphaned.length > 0 && (
            <Card title="Not in this plan">
              <Aside tilt={-1.5} tint="gold" className="mb-2">
                scheduled outside the {months} months mapped, so nothing counts{' '}
                {plan.orphaned.length === 1 ? 'it' : 'them'}
              </Aside>
              {plan.orphaned.map((i) => (
                <div key={i.id} className="row">
                  <span className="row-label">
                    {i.label}
                    <span className="row-meta block">
                      starts month {i.startMonth + 1} of a {months}-month plan
                    </span>
                  </span>
                  <span className="num tint-muted text-[14px]">{php(i.amount)}</span>
                </div>
              ))}
            </Card>
          )}

          <Card title="Where it goes">
            <Row
              mark={<PayerMark shape="solid" />}
              label="Tin's costs"
              amount={php(plan.costs.her)}
            />
            <Row
              mark={<PayerMark shape="hollow" />}
              label="Jhay's costs"
              amount={php(plan.costs.him)}
            />
            <Row
              mark={<PayerMark shape="both" />}
              label="Food"
              sub={`${php(config.food.dailyBudget)}/day for the days you're there`}
              amount={php(plan.food.total)}
            />
            <Row label="Tin's income + savings" amount={php(plan.income.her + plan.moneyIn.her)} />
            <Row label="Jhay's income" amount={php(plan.income.him + plan.moneyIn.him)} />

            {plan.foodVariance.gap > 0 && (
              <Aside tilt={-1.5} tint="gold" className="mt-2">
                your day types imply {php(plan.foodVariance.forecast)}/mo against a{' '}
                {php(plan.foodVariance.budgeted)} allowance — {php(plan.foodVariance.gap)} over
              </Aside>
            )}
          </Card>

          <Card title="Logged vs forecast" className="mb-8">
            {!pace ? (
              <p className="empty py-3">nothing logged yet — the forecast is still a guess</p>
            ) : (
              <>
                <PaceBar
                  label="logged"
                  value={pace.actualPerDay}
                  max={Math.max(pace.actualPerDay, pace.forecastPerDay)}
                  tint={pace.delta > 0 ? 'brick' : 'green'}
                />
                <PaceBar
                  label="forecast"
                  value={pace.forecastPerDay}
                  max={Math.max(pace.actualPerDay, pace.forecastPerDay)}
                  tint="muted"
                />
                <Aside tilt={-1.2} tint={pace.delta > 0 ? 'brick' : 'green'} className="mt-3">
                  running {php(Math.abs(pace.monthlyDelta))}/mo{' '}
                  {pace.delta > 0 ? 'over' : 'under'}
                </Aside>
                <p className="tint-muted mt-1 text-[11.5px]">
                  over {pace.days} {pace.days === 1 ? 'day' : 'days'} with entries
                </p>
              </>
            )}
          </Card>
        </>
      )}
    </Screen>
  );
}

function PaceBar({
  label,
  value,
  max,
  tint,
}: {
  label: string;
  value: number;
  max: number;
  tint: 'green' | 'brick' | 'muted';
}) {
  const width = max > 0 ? Math.min(value / max, 1) * 100 : 0;
  const fill =
    tint === 'muted' ? 'var(--charcoal)' : tint === 'brick' ? 'var(--brick)' : 'var(--green)';
  return (
    <div className="mb-2 flex items-center gap-2.5">
      <span className="tint-muted w-[56px] text-[11.5px]">{label}</span>
      <span className="pace flex-1">
        <span className="pace-fill" style={{ width: `${width}%`, background: fill }} />
      </span>
      <span className="num w-[56px] text-right text-[13px]">{php(value)}</span>
    </div>
  );
}
