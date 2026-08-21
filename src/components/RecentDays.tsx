import { relativeDate } from '@/lib/date';
import { php } from '@/lib/model';
import { Tally } from '@/components/Tally';
import { Aside } from '@/components/Screen';

/** One stroke per quarter of a day's allowance, so a day reads at a glance. */
function strokes(total: number, dailyBudget: number): number {
  if (total <= 0) return 0;
  return Math.max(1, Math.round(total / (dailyBudget / 4)));
}

export function RecentDays({
  days,
  today,
  dailyBudget,
}: {
  days: { day: string; total: number; count: number }[];
  today: string;
  dailyBudget: number;
}) {
  if (days.length === 0) return null;

  // How many lean days it would take to work off the accumulated overspend.
  const over = days.reduce((s, d) => s + Math.max(0, d.total - dailyBudget), 0);
  const under = days.reduce((s, d) => s + Math.max(0, dailyBudget - d.total), 0);

  return (
    <section className="pb-8">
      <div className="leader mt-7 mb-2">
        <h2 className="sign-label tint-teal">Recent days</h2>
        <span className="leader-fill" aria-hidden />
      </div>

      <ul className="flex flex-col gap-2.5">
        {days.map((d) => {
          const ratio = d.total / dailyBudget;
          const tint = ratio <= 1 ? 'green' : ratio <= 1.25 ? 'gold' : 'brick';
          return (
            <li key={d.day} className="flex items-center gap-2.5">
              <span className="tint-muted w-[58px] text-[11.5px]">
                {relativeDate(d.day, today)}
              </span>
              <span className="flex-1">
                <Tally count={strokes(d.total, dailyBudget)} tint={tint} />
              </span>
              <span className="num w-[54px] text-right text-[13.5px]">{php(d.total)}</span>
            </li>
          );
        })}
      </ul>

      {over > 0 && (
        <Aside tilt={-0.7} className="mt-3">
          {Math.ceil(over / (dailyBudget - 160))} lean {over / (dailyBudget - 160) <= 1 ? 'day' : 'days'} and
          you&rsquo;re level
        </Aside>
      )}
      {over === 0 && under > 0 && (
        <Aside tilt={-0.7} tint="green" className="mt-3">
          {php(under)} saved across these days
        </Aside>
      )}
    </section>
  );
}
