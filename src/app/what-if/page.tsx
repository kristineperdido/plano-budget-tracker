'use client';

import { useCallback, useMemo, useState } from 'react';
import { Screen, Card, Aside } from '@/components/Screen';
import { Signed } from '@/components/Money';
import { PayerMark } from '@/components/Payer';
import type { Config } from '@/lib/config';
import { useConfig } from '@/lib/useConfig';
import { computePlan, foodForecast } from '@/lib/engine';
import { computeCashflow } from '@/lib/cashflow';
import { php } from '@/lib/model';

/**
 * The sliders bind to one phase at a time. They used to be wired to
 * `phases[0]` outright — the length slider was even called "months without
 * income" — so once a second phase existed there was no way to model it.
 */
type Knobs = {
  /** Which phase the phase-specific sliders act on. */
  phaseId: string;
  months: number;
  herIncome: number;
  himIncome: number;
  sideHustle: number;
  /** These two apply to the whole plan, not to one phase. */
  foodPerDay: number;
  uncertainMoney: number;
};

/** The runway is read with everything available, so dragging shows the ceiling. */
const FLOW_OPTS = { includeUncertain: true, includePending: false, useBackup: true } as const;

/** Read the knob positions the stored config currently implies, for one phase. */
function knobsFrom(config: Config, phaseId?: string): Knobs {
  const phase = config.phases.find((p) => p.id === phaseId) ?? config.phases[0];
  const uncertain = config.moneyIn.find((m) => m.uncertain);
  return {
    phaseId: phase?.id ?? '',
    months: phase?.months ?? 1,
    herIncome: phase?.income.her ?? 0,
    himIncome: phase?.income.him ?? 0,
    sideHustle: phase?.income.herSideHustle ?? 0,
    foodPerDay: Math.round(foodForecast(config.food).foodPerDay),
    uncertainMoney: uncertain?.amount ?? 0,
  };
}

/**
 * Push the knob positions back into a config. Day-type amounts scale together
 * so their shape survives: a lean day stays proportionally lean.
 */
function applyKnobs(config: Config, k: Knobs): Config {
  const base = foodForecast(config.food).foodPerDay;
  const scale = base > 0 ? k.foodPerDay / base : 1;

  return {
    ...config,
    food: {
      ...config.food,
      dayTypes: config.food.dayTypes.map((t) => ({ ...t, amount: Math.round(t.amount * scale) })),
    },
    moneyIn: config.moneyIn.map((m) => (m.uncertain ? { ...m, amount: k.uncertainMoney } : m)),
    phases: config.phases.map((p) =>
      p.id === k.phaseId
        ? {
            ...p,
            months: k.months,
            income: { her: k.herIncome, him: k.himIncome, herSideHustle: k.sideHustle },
          }
        : p,
    ),
  };
}

export default function WhatIfPage() {

  const { config, persist, saving, error } = useConfig();
  const [knobs, setKnobs] = useState<Knobs | null>(null);
  const [applied, setApplied] = useState(false);

  // Seed the sliders from the stored plan once it arrives, and re-seed whenever
  // the other phone changes it — but never while a drag is in progress.
  const [seededFor, setSeededFor] = useState<Config | null>(null);
  if (config && config !== seededFor && knobs === null) {
    setSeededFor(config);
    setKnobs(knobsFrom(config));
  }

  // Everything here is local until Apply. The stored config is never touched by
  // dragging, so a half-finished thought cannot leak onto the other phone.
  const draft = useMemo(
    () => (config && knobs ? applyKnobs(config, knobs) : null),
    [config, knobs],
  );
  const preview = useMemo(
    () =>
      draft ? computePlan(draft, { includeUncertain: true, includePending: false }) : null,
    [draft],
  );
  const previewFood = useMemo(() => (draft ? foodForecast(draft.food) : null), [draft]);

  /** Where the selected phase sits in the timeline being previewed. */
  const windowFor = (cfg: Config, phaseId: string) => {
    let offset = 0;
    for (const p of cfg.phases) {
      if (p.id === phaseId) return { from: offset, to: offset + p.months - 1 };
      offset += p.months;
    }
    return null;
  };

  // The sliders act on one phase, so the result has to as well. It used to show
  // the whole plan while the controls above it changed a single stretch.
  const scoped = useMemo(() => {
    if (!draft || !knobs) return null;
    const w = windowFor(draft, knobs.phaseId);
    return w
      ? computePlan(draft, { includeUncertain: true, includePending: false, window: w })
      : null;
  }, [draft, knobs]);

  const scopedBefore = useMemo(() => {
    if (!config || !knobs) return null;
    const w = windowFor(config, knobs.phaseId);
    return w
      ? computePlan(config, { includeUncertain: true, includePending: false, window: w })
      : null;
  }, [config, knobs]);

  // "Can we?" is a runway question, and the runway is whole-plan by nature —
  // shifting one phase's length moves every month after it.
  const previewFlow = useMemo(() => (draft ? computeCashflow(draft, FLOW_OPTS) : null), [draft]);
  const baseFlow = useMemo(() => (config ? computeCashflow(config, FLOW_OPTS) : null), [config]);

  const baseline = useMemo(
    () => (config ? computePlan(config, { includeUncertain: true, includePending: false }) : null),
    [config],
  );

  const dirty = useMemo(
    () => (config && knobs ? JSON.stringify(knobs) !== JSON.stringify(knobsFrom(config)) : false),
    [config, knobs],
  );

  const apply = useCallback(async () => {
    if (!config || !knobs) return;
    const next = applyKnobs(config, knobs);
    await persist(
      next,
      `Applied a what-if to ${
        config.phases.find((p) => p.id === knobs.phaseId)?.label ?? 'the plan'
      }: ${knobs.months} months, food ${php(knobs.foodPerDay)}/day`,
    );
    setSeededFor(next);
    setKnobs(knobsFrom(next, knobs.phaseId));
    setApplied(true);
  }, [config, knobs, persist]);

  return (
    <Screen
      title="What if"
      meta={saving ? 'applying…' : dirty ? 'not saved' : applied ? 'applied' : 'in sync'}
    >
      {error && (
        <p className="tint-brick mt-4 text-[12.5px]" role="alert">
          {error}
        </p>
      )}

      {!config || !knobs || !preview || !baseline || !previewFood || !scoped || !scopedBefore || !previewFlow || !baseFlow ? (
        <p className="empty py-16 text-center">working the numbers…</p>
      ) : (
        <>
          <Card>
            <Aside tilt={-2.5} className="text-[25px]">
              Drag freely.
              <br />
              Nothing breaks.
            </Aside>
            <p className="tint-muted mt-2 text-[12.5px]">Nothing saves until you tap Apply.</p>
          </Card>

          <Card>
          {/* Pick the stretch of the plan to play with. */}
          <div className="mb-4 flex flex-wrap gap-1.5">
            {config.phases.map((p) => {
              const on = p.id === knobs.phaseId;
              return (
                <button
                  key={p.id}
                  type="button"
                  className="chip"
                  data-on={on}
                  aria-pressed={on}
                  onClick={() => setKnobs(knobsFrom(config, p.id))}
                >
                  {p.label}
                </button>
              );
            })}
          </div>

          <Slider
            label="How long it lasts"
            note="months in this phase — the ones after it shift along, so the plan gets longer or shorter"
            value={knobs.months}
            min={1}
            max={24}
            step={1}
            format={(v) => `${v} ${v === 1 ? 'month' : 'months'}`}
            onChange={(v) => setKnobs({ ...knobs, months: v })}
          />
          <Slider
            label="Tin earns"
            note="her take-home each month of this phase only"
            value={knobs.herIncome}
            min={0}
            max={80000}
            step={1000}
            format={(v) => `${php(v)}/mo`}
            onChange={(v) => setKnobs({ ...knobs, herIncome: v })}
          />
          <Slider
            label="Jhay earns"
            note="his take-home each month of this phase only"
            value={knobs.himIncome}
            min={0}
            max={80000}
            step={1000}
            format={(v) => `${php(v)}/mo`}
            onChange={(v) => setKnobs({ ...knobs, himIncome: v })}
          />
          <Slider
            label="Side hustle"
            note="added to tin's income, on top of what she earns above"
            value={knobs.sideHustle}
            min={0}
            max={20000}
            step={500}
            format={(v) => `${php(v)}/mo`}
            onChange={(v) => setKnobs({ ...knobs, sideHustle: v })}
          />

          <div className="leader mt-5 mb-3">
            <h3 className="sign-label tint-teal">Across the whole plan</h3>
            <span className="leader-fill" aria-hidden />
          </div>

          <Slider
            label="Food per day"
            note="scales all three kinds of day together, keeping their shape — it does not change the ₱500 allowance"
            value={knobs.foodPerDay}
            min={150}
            max={900}
            step={10}
            format={php}
            onChange={(v) => setKnobs({ ...knobs, foodPerDay: v })}
          />
          <Slider
            label="Uncertain money"
            note="what the brother's repayment is worth if it arrives — Plan leaves it out by default"
            value={knobs.uncertainMoney}
            min={0}
            max={30000}
            step={1000}
            format={php}
            onChange={(v) => setKnobs({ ...knobs, uncertainMoney: v })}
          />
          </Card>

          <div className="panel mt-4">
            <span className="tape tape-r" style={{ right: 24 }} aria-hidden />

            <div className="leader mb-2">
              <span className="sign-label tint-teal">
                {config.phases.find((p) => p.id === knobs.phaseId)?.label ?? 'This phase'}
              </span>
              <span className="leader-fill" aria-hidden />
              <span className="row-meta">across the phase</span>
            </div>

            <div className="flex gap-3">
              <Net label="tin" shape="solid" value={scoped.net.her} was={scopedBefore.net.her} />
              <Net label="jhay" shape="hollow" value={scoped.net.him} was={scopedBefore.net.him} />
              <Net
                label="both"
                shape="both"
                value={scoped.combined}
                was={scopedBefore.combined}
              />
            </div>

            <div className="mt-4 border-t pt-3" style={{ borderColor: 'var(--rule)' }}>
              {/* The runway is the real answer to "can we", and it is whole-plan
                  by nature: lengthening one phase moves every month after it. */}
              <div className="row">
                <span className="row-label">
                  Money lasts until
                  <span className="row-meta block">
                    across all {previewFlow.months.length} months
                    {previewFlow.projectedDry && `, giving out ${previewFlow.projectedDry}`}
                  </span>
                </span>
                <span className="text-right">
                  <span
                    className={`num text-[15px] ${
                      previewFlow.firstMonthShort ? 'tint-brick' : 'tint-green'
                    }`}
                  >
                    {previewFlow.firstMonthShort ?? previewFlow.lastsUntil ?? '—'}
                  </span>
                  {(previewFlow.firstMonthShort ?? previewFlow.lastsUntil) !==
                    (baseFlow.firstMonthShort ?? baseFlow.lastsUntil) && (
                    <span className="row-meta block">
                      was {baseFlow.firstMonthShort ?? baseFlow.lastsUntil}
                    </span>
                  )}
                </span>
              </div>

              <div className="row">
                <span className="row-label">
                  Does it hold?
                  <span className="row-meta block">
                    {previewFlow.monthsCovered} of {previewFlow.months.length} months covered
                  </span>
                </span>
                <Verdict combined={previewFlow.firstMonthShort ? -1 : scoped.combined} />
              </div>
              <div className="row">
                <span className="row-label">
                  Food against the allowance
                  <span className="row-meta block">
                    {php(previewFood.perMonth)}/mo vs {php(previewFood.budgetPerMonth)}
                  </span>
                </span>
                <span
                  className={`num text-[14px] ${
                    previewFood.perMonth > previewFood.budgetPerMonth ? 'tint-brick' : 'tint-green'
                  }`}
                >
                  {previewFood.perMonth > previewFood.budgetPerMonth ? '+' : '−'}
                  {php(Math.abs(previewFood.perMonth - previewFood.budgetPerMonth))}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-4 mb-8 flex gap-2.5">
            <button
              type="button"
              className="btn btn--primary flex-[2]"
              disabled={!dirty || saving}
              onClick={() => void apply()}
            >
              {saving ? 'Applying…' : 'Apply to plan'}
            </button>
            <button
              type="button"
              className="btn btn--ghost flex-1"
              disabled={!dirty}
              onClick={() => setKnobs(knobsFrom(config))}
            >
              Reset
            </button>
          </div>
        </>
      )}
    </Screen>
  );
}

function Slider({
  label,
  note,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  /** What moving this actually changes — and, where it matters, what it does not. */
  note?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="mb-5 block">
      <span className="flex items-baseline justify-between">
        <span className="text-[13.5px]">{label}</span>
        <span className="num text-[14px]">{format(value)}</span>
      </span>
      {note && <span className="row-meta mt-0.5 block">{note}</span>}
      <input
        type="range"
        className="slider mt-2"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

function Net({
  label,
  shape,
  value,
  was,
}: {
  label: string;
  shape: 'solid' | 'hollow' | 'both';
  value: number;
  was: number;
}) {
  const moved = Math.round(value) !== Math.round(was);
  return (
    <div className="flex-1">
      <span className="payer">
        <PayerMark shape={shape} />
        <span className="payer-name">{label}</span>
      </span>
      <div className="mt-1.5">
        <Signed value={value} size="17px" />
      </div>
      {moved && (
        <p className="tint-muted mt-0.5 text-[11px]">was {php(Math.abs(was))}</p>
      )}
    </div>
  );
}

/** Green when it clears, gold when it only just does, brick when it does not. */
function Verdict({ combined }: { combined: number }) {
  if (combined < 0) return <span className="stamp stamp--brick">Does not hold</span>;
  if (combined < 5000) return <span className="stamp stamp--gold">Tight</span>;
  return <span className="stamp stamp--green">Holds</span>;
}
