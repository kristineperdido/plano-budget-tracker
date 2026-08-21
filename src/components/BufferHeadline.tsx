'use client';

import { php } from '@/lib/model';
import { Aside } from '@/components/Screen';
import type { Envelope } from '@/lib/envelope';

export type View = 'day' | 'month';

/**
 * The one number that matters, circled in marker, with a switch between what is
 * left today and what is left this month. They are two readings of the same
 * pot: today's limit is simply the month's remainder divided by the days still
 * to come.
 */
export function BufferHeadline({
  envelope,
  view,
  onView,
  potLabel,
}: {
  envelope: Envelope;
  view: View;
  onView: (v: View) => void;
  potLabel: string;
}) {
  if (!envelope.started) {
    return (
      <section className="relative pt-5 pb-4 text-center">
        <p className="sign-label tint-teal" style={{ letterSpacing: '0.2em' }}>
          Starts
        </p>
        <p className="num num-hero tint-muted mt-2">{envelope.daysCovered}</p>
        <p className="tint-muted mt-3 text-[12.5px] leading-[1.5]">
          days of this month will be tracked
          <br />
          {php(envelope.monthlyBudget)} for the part-month
        </p>
      </section>
    );
  }

  const daily = view === 'day';
  const value = daily ? envelope.leftToday : envelope.leftThisMonth;
  const over = value < 0;
  const amount = Math.abs(value);

  return (
    <section className="relative pt-5 pb-4 text-center">
      <div className="mb-3 inline-flex gap-1.5">
        <button
          type="button"
          className="chip"
          data-on={daily}
          aria-pressed={daily}
          onClick={() => onView('day')}
        >
          Today
        </button>
        <button
          type="button"
          className="chip"
          data-on={!daily}
          aria-pressed={!daily}
          onClick={() => onView('month')}
        >
          This month
        </button>
      </div>

      <p className="sign-label tint-teal" style={{ letterSpacing: '0.2em' }}>
        {over ? 'Over' : 'Left to spend'}
      </p>

      <div className="relative mt-2 inline-block px-5 py-1.5">
        <span className="circled" aria-hidden />
        <span
          className={`num num-hero relative ${over ? 'tint-brick' : 'tint-green'}`}
          aria-label={`${php(amount)} ${over ? 'over' : 'left'} ${daily ? 'today' : 'this month'}`}
        >
          {over ? '−' : ''}
          {php(amount)}
        </span>
      </div>

      {daily ? (
        <p className="tint-muted mt-4 text-[12.5px] leading-[1.5]">
          {php(envelope.pool)} left over {envelope.daysLeft}{' '}
          {envelope.daysLeft === 1 ? 'day' : 'days'} = {php(envelope.dailyLimit)} a day
          <br />
          spent {php(envelope.spentToday)} today
        </p>
      ) : (
        <p className="tint-muted mt-4 text-[12.5px] leading-[1.5]">
          {php(envelope.monthlyBudget)} for the month, spent {php(envelope.spentMonth)}
          <br />
          {php(envelope.pool)} still daily + {php(envelope.pot)} in {potLabel.toLowerCase()}
        </p>
      )}

      <Aside
        tilt={4}
        tint={over ? 'brick' : 'green'}
        className="absolute right-0 top-[132px] text-left"
      >
        {over ? 'ease up' : 'still room'}
      </Aside>
    </section>
  );
}
