'use client';

import { php } from '@/lib/model';
import { monthNameOf } from '@/lib/date';
import { Aside } from '@/components/Screen';
import type { Envelope } from '@/lib/envelope';

/**
 * The month at a glance. Reads off the same envelope as the headline — it used
 * to run on a separate flat-accrual model, which meant this bar could say "on
 * pace" while the figure above it said you were over.
 */
export function MonthProgress({ envelope, today }: { envelope: Envelope; today: string }) {
  const elapsed = envelope.days.length;
  const through = envelope.daysCovered > 0 ? elapsed / envelope.daysCovered : 0;
  // What the month should have cost by now, if it were spent evenly.
  const expected = envelope.monthlyBudget * through;
  const over = envelope.spentMonth > expected;
  const gap = Math.abs(envelope.spentMonth - expected);
  const spentShare =
    envelope.monthlyBudget > 0
      ? Math.min(envelope.spentMonth / envelope.monthlyBudget, 1)
      : 0;

  return (
    <div className="panel">
      <span className="tape" style={{ left: 22 }} aria-hidden />

      <div className="leader mb-2">
        <h2 className="sign-label tint-teal">{monthNameOf(today)}</h2>
        <span className="leader-fill" aria-hidden />
        <span className="num text-[13px]">
          {php(envelope.spentMonth)}{' '}
          <span className="tint-muted">/ {php(envelope.monthlyBudget)}</span>
        </span>
      </div>

      <div className="pace">
        <div
          className={`pace-fill ${over ? 'pace-fill--over' : ''}`}
          style={{ width: `${spentShare * 100}%` }}
        />
        <div className="pace-marker" style={{ left: `${Math.min(through, 1) * 100}%` }} />
      </div>

      <div className="mt-2 flex items-baseline justify-between gap-3">
        <span className="tint-muted text-[11px]">
          day {elapsed} of {envelope.daysCovered}
          {envelope.daysCovered < envelope.daysInMonth && ' (part month)'}
        </span>
        <Aside tilt={2.5} tint={over ? 'brick' : 'green'} className="text-right">
          {over ? `${php(gap)} over` : 'on pace'}
        </Aside>
      </div>
    </div>
  );
}
