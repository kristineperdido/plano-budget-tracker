import Link from 'next/link';
import { php } from '@/lib/model';
import { Aside } from '@/components/Screen';

/**
 * A compact read on the goal, so the thing all this is for is visible on the
 * screen they actually open every day rather than buried behind a tab.
 */
export function SavingsStrip({
  balance,
  goalLabel,
  goalAmount,
}: {
  balance: number;
  goalLabel: string;
  goalAmount: number;
}) {
  const pct = goalAmount > 0 ? Math.min(balance / goalAmount, 1) : 0;

  return (
    <Link href="/savings" className="panel mt-4 block no-underline" style={{ color: 'var(--ink)' }}>
      <div className="leader mb-1.5">
        <h2 className="sign-label tint-teal">Saved</h2>
        <span className="leader-fill" aria-hidden />
        <span className="num text-[20px] tint-green">{php(balance)}</span>
      </div>

      {goalAmount > 0 ? (
        <>
          <div className="pace">
            <div className="pace-fill" style={{ width: `${pct * 100}%` }} />
          </div>
          <div className="mt-1.5 flex items-baseline justify-between gap-3">
            <span className="tint-muted text-[11px]">{goalLabel}</span>
            <span className="num tint-muted text-[11.5px]">
              {Math.round(pct * 100)}% of {php(goalAmount)}
            </span>
          </div>
        </>
      ) : (
        <Aside tilt={-1.5}>no goal set yet</Aside>
      )}
    </Link>
  );
}
