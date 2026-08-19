import { relativeDate } from '@/lib/date';
import { DAILY_BUDGET, php } from '@/lib/model';

export function RecentDays({
  days,
  today,
}: {
  days: { day: string; total: number; count: number }[];
  today: string;
}) {
  if (days.length === 0) return null;

  return (
    <section className="px-5 pb-8">
      <h2 className="tint-muted mb-1 text-[0.7rem] uppercase tracking-[0.18em]">
        Recent days
      </h2>
      <ul>
        {days.map((d) => {
          const delta = DAILY_BUDGET - d.total;
          return (
            <li key={d.day} className="leader py-1.5">
              <span className="text-[0.85rem]">{relativeDate(d.day, today)}</span>
              <span className="leader-fill" aria-hidden />
              <span
                className={`num text-[0.7rem] ${delta >= 0 ? 'tint-green' : 'tint-brick'}`}
              >
                {delta >= 0 ? '+' : '−'}
                {php(Math.abs(delta))}
              </span>
              <span className="num w-[4.5rem] text-right text-[0.85rem]">
                {php(d.total)}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
