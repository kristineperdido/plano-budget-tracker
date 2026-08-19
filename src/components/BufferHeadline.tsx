import { DAILY_BUDGET, php, type TodayStats } from '@/lib/model';

export function BufferHeadline({ s }: { s: TodayStats }) {
  const over = s.buffer < 0;
  const amount = Math.abs(s.buffer);

  return (
    <section className="px-5 pt-7 pb-6 text-center">
      <p className="tint-muted text-[0.7rem] uppercase tracking-[0.18em]">
        {over ? 'Over pace' : 'Available to spend'}
      </p>

      <p
        className={`num mt-2 text-[3.1rem] leading-none ${over ? 'tint-brick' : 'tint-green'}`}
        aria-label={`${php(amount)} ${over ? 'over pace' : 'available'}`}
      >
        {over ? '−' : ''}
        {php(amount)}
      </p>

      <p className="tint-muted serif mt-3 text-[0.82rem] italic">
        {php(DAILY_BUDGET)}/day × {s.daysElapsed}{' '}
        {s.daysElapsed === 1 ? 'day' : 'days'} = {php(s.accrued)}, spent {php(s.spentMonth)}
      </p>

      {s.spentToday > 0 && (
        <p className="mt-1 text-[0.82rem]">
          <span className="tint-muted">Today so far </span>
          <span className="num">{php(s.spentToday)}</span>
        </p>
      )}
    </section>
  );
}
