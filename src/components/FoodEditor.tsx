'use client';

import { AmountField } from '@/components/AmountField';
import { Tally } from '@/components/Tally';
import { Aside } from '@/components/Screen';
import { dayTypeTint, type Config, type DayType, type Extra } from '@/lib/config';
import { foodForecast } from '@/lib/engine';
import { php } from '@/lib/model';

/**
 * The day types and recurring extras that produce the food forecast.
 *
 * This used to be a tab of its own, which put a screen you set once and rarely
 * reopen in prime navigation while Savings — the thing being worked toward —
 * was buried behind a menu. The inputs belong with the rest of the
 * configuration; the number they produce shows on Plan, where it is spent.
 */
export function FoodEditor({
  config,
  setConfig,
  persist,
}: {
  config: Config;
  setConfig: (c: Config) => void;
  persist: (c: Config, note: string) => void;
}) {
  const f = foodForecast(config.food);
  const weekDays = config.food.dayTypes.reduce((s, t) => s + t.perWeek, 0);

  const patchDay = (id: string, change: Partial<DayType>, note: string) =>
    persist(
      {
        ...config,
        food: {
          ...config.food,
          dayTypes: config.food.dayTypes.map((t) => (t.id === id ? { ...t, ...change } : t)),
        },
      },
      note,
    );

  const patchExtra = (id: string, change: Partial<Extra>, note: string) =>
    persist(
      {
        ...config,
        food: {
          ...config.food,
          extras: config.food.extras.map((e) => (e.id === id ? { ...e, ...change } : e)),
        },
      },
      note,
    );

  return (
    <>
      <p className="row-meta -mt-1 mb-2">
        a week as you actually live it · Plan charges {php(config.food.dailyBudget)}/day
      </p>

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
              onBlur={(e) => patchDay(t.id, { label: e.target.value }, `Day type renamed to ${e.target.value}`)}
            />
            <AmountField
              label={`Cost of a ${t.label} day`}
              value={t.amount}
              onCommit={(v) => patchDay(t.id, { amount: v }, `${t.label} set to ${php(v)}`)}
            />
          </div>
          <div className="mt-1 flex items-center gap-2.5">
            <Tally count={t.perWeek} tint={dayTypeTint(config.food.dayTypes, t.id)} max={7} />
            <span className="flex-1" />
            <span className="tint-muted text-[11.5px]">days a week</span>
            <AmountField
              label={`${t.label} days per week`}
              prefix=""
              width="1.8rem"
              value={t.perWeek}
              onCommit={(v) =>
                patchDay(t.id, { perWeek: Math.round(v) }, `${t.label} set to ${Math.round(v)} days a week`)
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

      {/* Extras ride on top of whichever kind of day it is. */}
      <div className="leader mt-5 mb-1">
        <h3 className="sign-label tint-teal">Extras</h3>
        <span className="leader-fill" aria-hidden />
        <span className="num text-[13px]">{php(f.extrasPerDay)}/day</span>
      </div>

      {f.extras.length === 0 && <p className="empty py-2">no extras on top</p>}

      {f.extras.map((e) => (
        <div key={e.id} className="mb-2.5 border p-3" style={{ borderColor: 'var(--rule)' }}>
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
              onBlur={(ev) => patchExtra(e.id, { label: ev.target.value }, `Extra renamed to ${ev.target.value}`)}
            />
            <AmountField
              label={`Cost per ${e.label} run`}
              value={e.cost}
              onCommit={(v) => patchExtra(e.id, { cost: v }, `${e.label} set to ${php(v)} a run`)}
            />
          </div>

          <div className="mt-1.5 flex items-center gap-2.5">
            <Tally count={e.perWeek} max={7} />
            <span className="flex-1" />
            <span className="tint-muted text-[11.5px]">runs a week</span>
            <AmountField
              label={`${e.label} runs per week`}
              prefix=""
              width="1.8rem"
              value={e.perWeek}
              onCommit={(v) =>
                patchExtra(e.id, { perWeek: Math.round(v) }, `${e.label} set to ${Math.round(v)} runs a week`)
              }
            />
          </div>

          {e.perWeek > 0 && (
            <Aside tilt={-2} tint="green" className="mt-1.5">
              drop one a week → save {php(e.perSkippedRun)} a month
            </Aside>
          )}

          <button
            type="button"
            className="chip tint-brick mt-2.5"
            onClick={() =>
              persist(
                {
                  ...config,
                  food: { ...config.food, extras: config.food.extras.filter((x) => x.id !== e.id) },
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
          persist(
            {
              ...config,
              food: {
                ...config.food,
                extras: [
                  ...config.food.extras,
                  { id: `extra-${Date.now()}`, label: 'New extra', cost: 0, perWeek: 1 },
                ],
              },
            },
            'Added a recurring extra',
          )
        }
      >
        + one more extra
      </button>

      <div className="leader mt-4 border-t pt-2.5" style={{ borderColor: 'var(--rule)' }}>
        <span className="sign-label">Forecast</span>
        <span className="leader-fill" aria-hidden />
        <span className={`num text-[17px] ${f.perDay > config.food.dailyBudget ? 'tint-brick' : 'tint-green'}`}>
          {php(f.perDay)}/day
        </span>
      </div>
      {f.perDay > config.food.dailyBudget && (
        <Aside tilt={-1.5} tint="brick" className="mt-2">
          {php(f.perDay - config.food.dailyBudget)}/day more than the allowance
        </Aside>
      )}
    </>
  );
}
