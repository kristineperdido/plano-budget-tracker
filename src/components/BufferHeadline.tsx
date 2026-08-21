import { php, type TodayStats } from '@/lib/model';
import { Aside } from '@/components/Screen';

/**
 * The one number that matters, circled in marker. The circle is the only
 * hand-drawn shape in the design that carries meaning rather than decoration:
 * it says "this is the figure to read".
 */
export function BufferHeadline({ s }: { s: TodayStats }) {
  const over = s.buffer < 0;
  const amount = Math.abs(s.buffer);

  return (
    <section className="relative pt-6 pb-4 text-center">
      <p className="sign-label tint-teal" style={{ letterSpacing: '0.2em' }}>
        {over ? 'Over pace' : 'Available to spend'}
      </p>

      <div className="relative mt-3 inline-block px-5 py-1.5">
        <span className="circled" aria-hidden />
        <span
          className={`num num-hero relative ${over ? 'tint-brick' : 'tint-green'}`}
          aria-label={`${php(amount)} ${over ? 'over pace' : 'available to spend'}`}
        >
          {over ? '−' : ''}
          {php(amount)}
        </span>
      </div>

      <Aside
        tilt={4}
        tint={over ? 'brick' : 'green'}
        className="absolute right-0 top-[92px] text-left"
      >
        {over ? 'ease up' : 'still room'}
      </Aside>

      <p className="tint-muted mt-4 text-[12.5px] leading-[1.5]">
        {php(s.dailyBudget)} × {s.daysElapsed} {s.daysElapsed === 1 ? 'day' : 'days'} ={' '}
        {php(s.accrued)}
        <br />
        spent {php(s.spentMonth)}
      </p>
    </section>
  );
}
