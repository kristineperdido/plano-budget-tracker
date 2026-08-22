'use client';

import { useEffect, useMemo, useState } from 'react';
import { useViewedPhase } from '@/lib/viewing';
import { Row, Signed } from '@/components/Money';
import { Screen, Card, Aside } from '@/components/Screen';
import { PayerMark, PayerTag } from '@/components/Payer';
import { useConfig } from '@/lib/useConfig';
import { computePlan, foodForecast, totalMonths } from '@/lib/engine';
import { phaseSpans, spanLabel } from '@/lib/phase';
import { computeCashflow } from '@/lib/cashflow';
import { CashflowPanel } from '@/components/Cashflow';
import { Runway } from '@/components/Runway';
import { addDays, monthIndexOf, monthOfIndex, todayISO } from '@/lib/date';
import { fetchEntries } from '@/lib/entries';
import { php } from '@/lib/model';
import type { FoodEntry } from '@/lib/types';

export default function PlanPage() {
  const { config, setConfig, persist, error: configError } = useConfig();
  const [entries, setEntries] = useState<FoodEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Off by default. Counting the brother's repayment as money in hand is what
  // made the headline read +8,998 while the committed position was short.
  const [includeUncertain, setIncludeUncertain] = useState(false);
  const [includePending, setIncludePending] = useState(false);
  // Shared with the Ledger: picking a phase here decides which scheme the
  // Ledger opens on, so the two screens are never describing different stretches.
  const [viewPhase, setViewPhase] = useViewedPhase();
  /** Read every figure per month, or across the whole stretch. */
  const [per, setPer] = useState<'month' | 'phase'>('month');
  /** Whether the plan is allowed to spend the reserve that is meant to stay put. */
  const [useBackup, setUseBackup] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const today = todayISO();
    fetchEntries(addDays(today, -29), today).then(
      (e) => {
        if (cancelled) return;
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
  const spans = useMemo(
    () => (config ? phaseSpans(config, currentMonth) : []),
    [config, currentMonth],
  );
  const months = config ? totalMonths(config.phases, config.startMonth) : 0;
  const currentSpan = spans.find((s) => currentMonth >= s.from && currentMonth <= s.to) ?? null;
  /** 'all' reads the whole timeline; anything else is a phase id. */
  const whole = viewPhase === 'all';
  const active = whole
    ? null
    : (spans.find((s) => s.phase.id === viewPhase) ?? currentSpan ?? spans[0] ?? null);

  // One scope for the whole screen. Every figure below the selector obeys it —
  // the score panel used to show the whole plan while the switch directly above
  // it governed a card much further down.
  const scoped = useMemo(() => {
    if (!config) return null;
    if (whole || !active) return computePlan(config, { includeUncertain, includePending });
    return computePlan(config, {
      includeUncertain,
      includePending,
      window: { from: active.from, to: active.to },
    });
  }, [config, whole, active, includeUncertain, includePending]);

  const scopeMonths = whole || !active ? months : active.phase.months;

  /**
   * Per-month or per-phase, depending on the switch. Only ever applied to
   * recurring costs: dividing a one-off by the phase length describes a month
   * that never happens — it put ₱37,083 of move-in costs into tin's "monthly"
   * figure and inflated it to ₱24,994.
   */
  const scale = (v: number) => (per === 'month' && scopeMonths > 0 ? v / scopeMonths : v);

  /** Recurring costs (including food) and one-off costs, kept apart. */
  const split = useMemo(() => {
    if (!scoped) return null;
    const zero = { her: 0, him: 0 };
    const sum = (cadence: 'monthly' | 'onetime') =>
      scoped.items
        .filter((b) => b.item.cadence === cadence && b.occurrences > 0)
        .reduce((a, b) => ({ her: a.her + b.split.her, him: a.him + b.split.him }), zero);

    const monthly = sum('monthly');
    return {
      recurring: {
        her: monthly.her + scoped.food.split.her,
        him: monthly.him + scoped.food.split.him,
      },
      oneOff: sum('onetime'),
      oneOffItems: scoped.items.filter((b) => b.item.cadence === 'onetime' && b.occurrences > 0),
    };
  }, [scoped]);

  /**
   * The net at the selected scope. Per month it counts recurring costs only —
   * the one-offs are shown separately, because averaging the deposit across the
   * phase put tin's "monthly" net at −24,994 while her actual recurring costs
   * are 6,453.
   */
  const net = useMemo(() => {
    if (!scoped || !split) return null;
    if (per === 'phase') return { her: scoped.net.her, him: scoped.net.him };
    return {
      her: scoped.income.her + scoped.moneyIn.her - split.recurring.her,
      him: scoped.income.him + scoped.moneyIn.him - split.recurring.him,
    };
  }, [scoped, split, per]);

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

  // The toggles govern the runway and the month-by-month table too. They used
  // to move neither: the cashflow ignored them outright, and in a phase-scoped
  // per-month view neither could reach the score either — both pending items
  // are one-time, and money-in is excluded from a windowed calculation.
  const flow = useMemo(
    () =>
      config
        ? computeCashflow(config, { includeUncertain, includePending, useBackup })
        : null,
    [config, includeUncertain, includePending, useBackup],
  );

  return (
    <Screen
      title="Plan"
      meta={
        !plan
          ? undefined
          : whole
            ? `all ${months} months`
            : active
              ? `${spanLabel(active)}`
              : undefined
      }
    >
      {(error ?? configError) && (
        <p className="tint-brick mt-4 text-[12.5px]" role="alert">
          {error ?? configError}
        </p>
      )}

      {!plan || !config || !scoped || !split || !flow || !net ? (
        <p className="empty py-16 text-center">working the numbers…</p>
      ) : (
        <>
          {/* The runway leads and sits above the scope control, because it
              describes the whole plan rather than the phase being read. */}
          {/* No Hero wrapper: Runway does its own full-bleed for the headline
              only. Nesting the two applied the negative margins twice and threw
              the whole block 44px off the left edge, over the margin rule. */}
          <Runway flow={flow} />

          {/* The phase you are reading, what it means, and when it runs. */}
          <Card title="Where you are">
            <div className="flex flex-wrap items-stretch gap-1.5">
              <button
                type="button"
                className="chip"
                data-on={whole}
                aria-pressed={whole}
                onClick={() => setViewPhase('all')}
              >
                All {months} months
              </button>
              {spans.map((sp) => {
                const on = !whole && sp.phase.id === active?.phase.id;
                return (
                  <button
                    key={sp.phase.id}
                    type="button"
                    className="chip"
                    data-on={on}
                    aria-pressed={on}
                    style={on ? { transform: 'rotate(-0.8deg)' } : undefined}
                    onClick={() => setViewPhase(sp.phase.id)}
                  >
                    {sp.phase.label}
                  </button>
                );
              })}
            </div>

            {active && !whole && (
              <>
                <p className="num tint-muted mt-2.5 text-[12px]">
                  {spanLabel(active)} · {active.phase.months}{' '}
                  {active.phase.months === 1 ? 'month' : 'months'}
                  {active.elapsed !== null &&
                    active === currentSpan &&
                    ` · month ${active.elapsed} of ${active.phase.months}`}
                </p>

                {/* A label says what a phase is called; this says what it means. */}
                <input
                  aria-label={`What ${active.phase.label} means`}
                  placeholder="what happens in this stretch…"
                  className="field-text mt-2"
                  style={{ textAlign: 'left' }}
                  value={active.phase.note ?? ''}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      phases: config.phases.map((x) =>
                        x.id === active.phase.id ? { ...x, note: e.target.value } : x,
                      ),
                    })
                  }
                  onBlur={(e) =>
                    void persist(
                      {
                        ...config,
                        phases: config.phases.map((x) =>
                          x.id === active.phase.id
                            ? { ...x, note: e.target.value.trim() || undefined }
                            : x,
                        ),
                      },
                      `Described the ${active.phase.label} phase`,
                    )
                  }
                />

                {/* A phase another one already covers governs no months, so
                    every figure below it reads as nothing. That is worth saying
                    outright rather than leaving as a screen of zeroes. */}
                {active.ownedMonths === 0 ? (
                  <Aside tilt={-1.5} tint="brick" className="mt-2">
                    {active.shadowedBy.join(' and ').toLowerCase()} already covers these months,
                    so nothing below counts — change when this one starts
                  </Aside>
                ) : active.ownedMonths < active.phase.months ? (
                  <Aside tilt={-1.5} tint="gold" className="mt-2">
                    {active.phase.months - active.ownedMonths} of its{' '}
                    {active.phase.months} months are taken by{' '}
                    {active.shadowedBy.join(' and ').toLowerCase()}
                  </Aside>
                ) : null}

                {active !== currentSpan && currentSpan && (
                  <Aside tilt={-1.5} className="mt-2">
                    you&rsquo;re actually in {currentSpan.phase.label.toLowerCase()} right now
                  </Aside>
                )}
              </>
            )}
          </Card>

          {/* Read every figure per month, or across the whole stretch. */}
          <div className="mt-4 flex gap-1.5">
            <button
              type="button"
              className="chip flex-1"
              data-on={per === 'month'}
              aria-pressed={per === 'month'}
              onClick={() => setPer('month')}
            >
              Per month
            </button>
            <button
              type="button"
              className="chip flex-1"
              data-on={per === 'phase'}
              aria-pressed={per === 'phase'}
              onClick={() => setPer('phase')}
            >
              Whole phase
            </button>
          </div>

          {/* The score, at whatever scope is selected above. It used to show the
              whole plan while the switch directly above it governed a card much
              further down. */}
          <div className="panel mt-4">
            <span className="tape" style={{ left: 26 }} aria-hidden />
            <div className="leader mb-2">
              <span className="sign-label tint-teal">
                {whole ? `All ${months} months` : active?.phase.label}
              </span>
              <span className="leader-fill" aria-hidden />
              <span className="row-meta">{per === 'month' ? 'per month' : 'total'}</span>
            </div>

            {/* A bare figure under a name says nothing about what it is. */}
            <p className="row-meta mb-2">
              what each of you has left {per === 'month' ? 'each month' : 'over the stretch'},
              after your own share of the costs
            </p>

            <div className="flex gap-3">
              {(['her', 'him'] as const).map((who) => (
                <div key={who} className="flex-1">
                  <PayerTag payer={who} fixed={false} />
                  <div className="mt-1.5">
                    <Signed value={scale(net[who])} size="20px" />
                  </div>
                  <p className="row-meta mt-0.5">
                    {php(scale(who === 'her' ? scoped.income.her : scoped.income.him))} in ·{' '}
                    {php(scale(split.recurring[who]))} out
                  </p>
                </div>
              ))}
            </div>

            <div className="leader mt-4 border-t pt-3" style={{ borderColor: 'var(--rule)' }}>
              <span className="sign-label">Combined</span>
              <span className="leader-fill" aria-hidden />
              <Signed value={scale(net.her + net.him)} size="27px" />
            </div>

            {/* Say the basis outright. The same two people can be ahead every
                month on recurring costs and still far behind once the move-in
                costs land, and both of those are true at once. */}
            {per === 'month' && split.oneOff.her + split.oneOff.him > 0 && (
              <p className="row-meta mt-2">
                recurring costs only — the {php(split.oneOff.her + split.oneOff.him)} paid once
                is listed below
              </p>
            )}
            {whole && plan.backup.him + plan.backup.her > 0 && (
              <Aside tilt={-1.5} className="mt-2">
                + {php(plan.backup.him + plan.backup.her)} savings, untouched
              </Aside>
            )}
            {!whole && (
              <p className="row-meta mt-2">
                savings and repayments belong to the plan as a whole, so they are not counted
                inside a single phase
              </p>
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

          <div className="mt-1.5 flex gap-2">
            <button
              type="button"
              className="chip flex-1"
              data-on={useBackup}
              aria-pressed={useBackup}
              onClick={() => setUseBackup((v) => !v)}
            >
              {useBackup ? 'May touch the reserve' : "Won't touch the reserve"}
            </button>
          </div>

          {flow && (
            <CashflowPanel
              flow={flow}
              // Scoped like everything else below the selector. The table used
              // to show all five months whichever phase was selected, so income
              // set on one phase looked missing while reading another.
              only={whole || !active ? undefined : { from: active.from, to: active.to }}
              label={whole || !active ? `All ${months} months` : active.phase.label}
            />
          )}

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

          <Card
            title="Where it goes"
            amount={per === 'month' ? 'per month' : `${scopeMonths} months`}
          >
            <Row
              mark={<PayerMark shape="solid" />}
              label="Tin's costs"
              amount={php(scale(split.recurring.her))}
            />
            <Row
              mark={<PayerMark shape="hollow" />}
              label="Jhay's costs"
              amount={php(scale(split.recurring.him))}
            />
            <Row label="Tin's income" amount={php(scale(scoped.income.her))} />
            <Row label="Jhay's income" amount={php(scale(scoped.income.him))} />
            <p className="row-meta mt-1">
              recurring only — food is in here at {php(config.food.dailyBudget)}/day
            </p>
          </Card>

          {/* One-off costs are never averaged. Dividing the deposit by the
              phase length described a month that never happens. */}
          {split.oneOffItems.length > 0 && (
            <Card
              title="Paid once"
              amount={php(split.oneOff.her + split.oneOff.him)}
            >
              <p className="row-meta -mt-1 mb-2">
                lands in the month it falls, not averaged across the {scopeMonths} months
              </p>
              {split.oneOffItems.map((b) => (
                <Row
                  key={b.item.id}
                  mark={<PayerTag payer={b.item.payer} />}
                  label={b.item.label}
                  sub={monthOfIndex(config.startMonth, b.item.startMonth)}
                  amount={php(b.split.her + b.split.him)}
                />
              ))}
            </Card>
          )}

          {/* Arrived from the retired Food tab: the number it produced belongs
              where it is spent, and its inputs live in Settings. */}
          <Card title="What food is expected to cost">
            <div className="row">
              <span className="row-label">
                Budgeted
                <span className="row-meta block">
                  {php(config.food.dailyBudget)}/day, what the plan charges
                </span>
              </span>
              <span className="num text-[14px]">{php(plan.foodVariance.budgeted)}/mo</span>
            </div>
            <div className="row">
              <span className="row-label">
                Your day types imply
                <span className="row-meta block">edit them in Settings</span>
              </span>
              <span
                className={`num text-[14px] ${
                  plan.foodVariance.gap > 0 ? 'tint-brick' : 'tint-green'
                }`}
              >
                {php(plan.foodVariance.forecast)}/mo
              </span>
            </div>
            {plan.foodVariance.gap > 0 ? (
              <Aside tilt={-1.5} tint="brick" className="mt-2">
                {php(plan.foodVariance.gap)}/mo more than budgeted — either the days shift or
                the allowance does
              </Aside>
            ) : (
              <Aside tilt={-1.5} tint="green" className="mt-2">
                your week fits inside the allowance
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
