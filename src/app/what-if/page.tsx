'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Screen, Aside } from '@/components/Screen';
import { Signed } from '@/components/Money';
import { PayerMark } from '@/components/Payer';
import type { Config } from '@/lib/config';
import { fetchConfig, logChange, saveConfig } from '@/lib/configStore';
import { computePlan, foodForecast } from '@/lib/engine';
import { php } from '@/lib/model';

type Knobs = {
  foodPerDay: number;
  uncertainMoney: number;
  sideHustle: number;
  gapMonths: number;
};

/** Read the knob positions the stored config currently implies. */
function knobsFrom(config: Config): Knobs {
  const uncertain = config.moneyIn.find((m) => m.uncertain);
  return {
    foodPerDay: Math.round(foodForecast(config.food).foodPerDay),
    uncertainMoney: uncertain?.amount ?? 0,
    sideHustle: config.phases[0]?.income.herSideHustle ?? 0,
    gapMonths: config.phases[0]?.months ?? 1,
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
    phases: config.phases.map((p, i) =>
      i === 0
        ? { ...p, months: k.gapMonths, income: { ...p.income, herSideHustle: k.sideHustle } }
        : p,
    ),
  };
}

export default function WhatIfPage() {
  const [config, setConfig] = useState<Config | null>(null);
  const [knobs, setKnobs] = useState<Knobs | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [applied, setApplied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchConfig().then(
      (c) => {
        if (cancelled) return;
        setConfig(c);
        setKnobs(knobsFrom(c));
      },
      (e: unknown) => !cancelled && setError(e instanceof Error ? e.message : 'Could not load.'),
    );
    return () => {
      cancelled = true;
    };
  }, []);

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
    setSaving(true);
    try {
      const next = applyKnobs(config, knobs);
      await saveConfig(next);
      await logChange(
        `Applied a what-if: food ${php(knobs.foodPerDay)}/day, side hustle ${php(
          knobs.sideHustle,
        )}/mo, ${knobs.gapMonths} months without income`,
      );
      setConfig(next);
      setApplied(true);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not apply.');
    } finally {
      setSaving(false);
    }
  }, [config, knobs]);

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

      {!config || !knobs || !preview || !baseline || !previewFood ? (
        <p className="empty py-16 text-center">working the numbers…</p>
      ) : (
        <>
          <Aside tilt={-2.5} className="mt-2 text-[25px]">
            Drag freely.
            <br />
            Nothing breaks.
          </Aside>
          <p className="tint-muted mt-2 mb-5 text-[12.5px]">
            Nothing saves until you tap Apply.
          </p>

          <Slider
            label="Food per day"
            value={knobs.foodPerDay}
            min={150}
            max={900}
            step={10}
            format={php}
            onChange={(v) => setKnobs({ ...knobs, foodPerDay: v })}
          />
          <Slider
            label="Uncertain money"
            value={knobs.uncertainMoney}
            min={0}
            max={30000}
            step={1000}
            format={php}
            onChange={(v) => setKnobs({ ...knobs, uncertainMoney: v })}
          />
          <Slider
            label="Side hustle per month"
            value={knobs.sideHustle}
            min={0}
            max={20000}
            step={500}
            format={php}
            onChange={(v) => setKnobs({ ...knobs, sideHustle: v })}
          />
          <Slider
            label="Months without income"
            value={knobs.gapMonths}
            min={1}
            max={12}
            step={1}
            format={(v) => `${v}`}
            onChange={(v) => setKnobs({ ...knobs, gapMonths: v })}
          />

          <div className="panel mt-6">
            <span className="tape tape-r" style={{ right: 24 }} aria-hidden />
            <div className="flex gap-3">
              <Net label="tin" shape="solid" value={preview.net.her} was={baseline.net.her} />
              <Net label="jhay" shape="hollow" value={preview.net.him} was={baseline.net.him} />
              <Net label="both" shape="both" value={preview.combined} was={baseline.combined} />
            </div>

            <div className="mt-4 border-t pt-3" style={{ borderColor: 'var(--rule)' }}>
              <div className="row">
                <span className="row-label">Does it hold?</span>
                <Verdict combined={preview.combined} />
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

          <div className="mt-5 mb-8 flex gap-2.5">
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
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
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
