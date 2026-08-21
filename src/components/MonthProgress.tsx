'use client';

import { php, type TodayStats } from '@/lib/model';
import { monthNameOf } from '@/lib/date';
import { Aside } from '@/components/Screen';

/**
 * The month at a glance: the fill is what has been spent, the upright rule is
 * where the month actually is. Fill past the rule means spending is ahead of
 * the calendar, and the bar turns brick to say so.
 */
export function MonthProgress({ s, today }: { s: TodayStats; today: string }) {
  const over = s.spentMonth > s.accrued;
  const gap = Math.abs(s.buffer);

  return (
    <div className="panel">
      <span className="tape" style={{ left: 22 }} aria-hidden />

      <div className="leader mb-2">
        <h2 className="sign-label tint-teal">{monthNameOf(today)}</h2>
        <span className="leader-fill" aria-hidden />
        <span className="num text-[13px]">
          {php(s.spentMonth)} <span className="tint-muted">/ {php(s.monthlyBudget)}</span>
        </span>
      </div>

      <div className="pace">
        <div
          className={`pace-fill ${over ? 'pace-fill--over' : ''}`}
          style={{ width: `${s.monthProgress * 100}%` }}
        />
        <div className="pace-marker" style={{ left: `${s.paceProgress * 100}%` }} />
      </div>

      <div className="mt-2 flex items-baseline justify-between gap-3">
        <span className="tint-muted text-[11px]">
          day {s.daysElapsed} of {s.daysInMonth}
        </span>
        {/* The projected figure stays available as the aria label; the aside is the
            same fact in plainer words. */}
        <Aside
          tilt={2.5}
          tint={over ? 'brick' : 'green'}
          className="text-right"
        >
          <span title={`Projected month-end ${php(s.projectedMonth)}`}>
            {over ? `${php(gap)} over` : 'on pace'}
          </span>
        </Aside>
      </div>
    </div>
  );
}
