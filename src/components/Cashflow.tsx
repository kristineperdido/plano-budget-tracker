'use client';

import { php } from '@/lib/model';
import { Card, Aside } from '@/components/Screen';
import type { Cashflow, MonthFlow } from '@/lib/cashflow';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const short = (m: string) => {
  const [y, mm] = m.split('-').map(Number);
  return `${MONTHS[mm - 1]} ${String(y).slice(2)}`;
};

/** The same colour the runway gives this month, so the two read as one thing. */
function tintOf(m: MonthFlow): string {
  if (m.short) return 'tint-brick';
  if (m.needsBackup) return 'tint-brick';
  if (m.needsUncertain) return 'tint-gold';
  return m.gap < 0 ? 'tint-green' : 'tint-green';
}

/**
 * The arithmetic behind the runway, month by month.
 *
 * This used to be three lines of prose per month with an unlabelled figure on
 * the right, and it repeated in words what the runway above now says in colour.
 * It is a table: what came in, what went out, and how far short. Which kind of
 * money covered each month is carried by the tint, matching the runway's key.
 */
export function CashflowPanel({ flow }: { flow: Cashflow; potLabel?: string }) {
  const totalOut = flow.months.reduce((s, m) => s + m.out, 0);
  const totalIn = flow.months.reduce((s, m) => s + m.income, 0);
  const reservesTotal = flow.reserves.committed + flow.reserves.uncertain + flow.reserves.backup;
  const leftAtEnd = reservesTotal - flow.totalGap;

  return (
    <Card title="Month by month" tape="left">
      <div className="num" style={{ fontSize: 12.5 }}>
        <div
          className="flex items-baseline gap-2 border-b pb-1"
          style={{ borderColor: 'var(--rule)' }}
        >
          {/* Muted, not teal: the card title above is teal, and two teal
              small-caps rows running together flattened the hierarchy. */}
          <span className="sign-label tint-muted" style={{ width: 52 }}>
            Month
          </span>
          <span className="sign-label tint-muted flex-1 text-right">In</span>
          <span className="sign-label tint-muted flex-1 text-right">Out</span>
          <span className="sign-label tint-muted flex-1 text-right">Short</span>
        </div>

        {flow.months.map((m) => (
          <div
            key={m.month}
            className="flex items-baseline gap-2 border-b border-dotted py-1.5"
            style={{ borderColor: 'var(--rule)' }}
          >
            <span className="tint-muted" style={{ width: 52 }}>
              {short(m.month)}
            </span>
            <span className="flex-1 text-right">{php(m.income)}</span>
            <span className="flex-1 text-right">{php(m.out)}</span>
            <span className={`flex-1 text-right ${tintOf(m)}`}>
              {m.gap < 0 ? `−${php(-m.gap)}` : `+${php(m.gap)}`}
            </span>
          </div>
        ))}

        <div className="flex items-baseline gap-2 pt-2">
          <span className="sign-label tint-muted" style={{ width: 52 }}>
            All
          </span>
          <span className="flex-1 text-right">{php(totalIn)}</span>
          <span className="flex-1 text-right">{php(totalOut)}</span>
          <span className="tint-brick flex-1 text-right">−{php(flow.totalGap)}</span>
        </div>
      </div>

      {/* What has to cover that shortfall, and in what order it gets spent. */}
      <div className="mt-4 border-t pt-2" style={{ borderColor: 'var(--rule)' }}>
        <div className="row">
          <span className="row-label">
            Money you can count on
            <span className="row-meta block">spent first</span>
          </span>
          <span className="num tint-green text-[13px]">{php(flow.reserves.committed)}</span>
        </div>
        {flow.reserves.uncertain > 0 && (
          <div className="row">
            <span className="row-label">
              Might not arrive
              <span className="row-meta block">
                {flow.firstMonthNeedingUncertain
                  ? `needed from ${short(flow.firstMonthNeedingUncertain)}`
                  : 'not needed'}
              </span>
            </span>
            <span className="num tint-gold text-[13px]">{php(flow.reserves.uncertain)}</span>
          </div>
        )}
        {flow.reserves.backup > 0 && (
          <div className="row">
            <span className="row-label">
              The reserve
              <span className="row-meta block">meant to stay untouched</span>
            </span>
            <span className="num tint-brick text-[13px]">{php(flow.reserves.backup)}</span>
          </div>
        )}

        <div className="leader mt-2 border-t pt-2.5" style={{ borderColor: 'var(--rule)' }}>
          <span className="sign-label">Left at the end</span>
          <span className="leader-fill" aria-hidden />
          <span className={`num text-[17px] ${leftAtEnd < 0 ? 'tint-brick' : 'tint-green'}`}>
            {php(leftAtEnd)}
          </span>
        </div>

        <Aside tilt={-1.5} tint={leftAtEnd < 0 ? 'brick' : 'gold'} className="mt-2">
          {php(reservesTotal)} of savings against {php(flow.totalGap)} of shortfall
        </Aside>
      </div>
    </Card>
  );
}
