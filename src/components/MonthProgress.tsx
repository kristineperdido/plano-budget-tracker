import { monthNameOf } from '@/lib/date';
import { php, type TodayStats } from '@/lib/model';

export function MonthProgress({ s, today }: { s: TodayStats; today: string }) {
  const over = s.spentMonth > s.accrued;

  return (
    <section className="px-5 pb-5">
      <div className="leader mb-2">
        <span className="text-[0.7rem] uppercase tracking-[0.18em]">
          {monthNameOf(today)}
        </span>
        <span className="leader-fill" aria-hidden />
        <span className="num text-[0.78rem]">
          {php(s.spentMonth)} / {php(s.monthlyBudget)}
        </span>
      </div>

      <div
        className="relative h-2.5 w-full overflow-hidden rounded-[1px]"
        style={{ background: 'var(--rule)' }}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={s.monthlyBudget}
        aria-valuenow={Math.round(s.spentMonth)}
        aria-label={`Spent ${php(s.spentMonth)} of ${php(s.monthlyBudget)} this month`}
      >
        <div
          className="h-full transition-[width] duration-500"
          style={{
            width: `${s.monthProgress * 100}%`,
            background: over ? 'var(--brick)' : 'var(--green)',
          }}
        />
        {/* Pace marker: where the month should be by today. */}
        <div
          className="absolute top-0 h-full w-px"
          style={{ left: `${s.paceProgress * 100}%`, background: 'var(--ink)' }}
          aria-hidden
        />
      </div>

      <div className="tint-muted mt-1.5 flex justify-between text-[0.7rem]">
        <span>
          Day {s.daysElapsed} of {s.daysInMonth}
        </span>
        <span className="num">
          Pace → {php(s.projectedMonth)}
        </span>
      </div>
    </section>
  );
}
