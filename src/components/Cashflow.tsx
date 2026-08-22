'use client';

import { useState } from 'react';
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
export function CashflowPanel({
  flow,
  only,
  label,
}: {
  flow: Cashflow;
  /** Month indices to show. Omitted means the whole plan. */
  only?: { from: number; to: number };
  /** What the rows are of, so the card says which scope you are reading. */
  label?: string;
  potLabel?: string;
}) {
  /** Which month is opened out. One at a time keeps the table readable. */
  const [expanded, setExpanded] = useState<string | null>(null);
  const shown = only
    ? flow.months.filter((m) => m.index >= only.from && m.index <= only.to)
    : flow.months;
  const totalOut = shown.reduce((s, m) => s + m.out, 0);
  const totalIn = shown.reduce((s, m) => s + m.income, 0);
  const shownGap = shown.reduce((s, m) => s + Math.max(0, -m.gap), 0);
  const reservesTotal = flow.reserves.committed + flow.reserves.uncertain + flow.reserves.backup;
  const leftAtEnd = reservesTotal - flow.totalGap;

  return (
    <Card title="Month by month" amount={label} tape="left">
      <div className="num" style={{ fontSize: 12.5 }}>
        <div
          className="flex items-baseline gap-2 border-b pb-1.5"
          style={{ borderColor: 'var(--rule)' }}
        >
          {/* Muted, not teal: the card title above is teal, and two teal
              small-caps rows running together flattened the hierarchy. */}
          <span className="sign-label tint-muted" style={{ width: 66 }}>
            Month
          </span>
          <span className="sign-label tint-muted flex-1 text-right">In</span>
          <span className="sign-label tint-muted flex-1 text-right">Out</span>
          <span className="sign-label tint-muted flex-1 text-right">Short</span>
        </div>

        {shown.map((m) => {
          const open = expanded === m.month;
          return (
            <div key={m.month} className="border-b border-dotted" style={{ borderColor: 'var(--rule)' }}>
              <button
                type="button"
                className="flex w-full items-baseline gap-2 py-2.5 text-left"
                style={{ background: 'transparent', border: 0 }}
                aria-expanded={open}
                onClick={() => setExpanded(open ? null : m.month)}
              >
                <span className="tint-muted flex items-baseline gap-1 whitespace-nowrap" style={{ width: 66 }}>
                  <span
                    aria-hidden
                    style={{
                      fontSize: 8,
                      transform: open ? 'rotate(90deg)' : 'none',
                      display: 'inline-block',
                    }}
                  >
                    ▶
                  </span>
                  {short(m.month)}
                </span>
                <span className="flex-1 text-right">{php(m.income)}</span>
                <span className="flex-1 text-right">{php(m.out)}</span>
                <span className={`flex-1 text-right ${tintOf(m)}`}>
                  {m.gap < 0 ? `−${php(-m.gap)}` : `+${php(m.gap)}`}
                </span>
              </button>

              {/* Every line, so a total that surprises you can be checked
                  against reality rather than taken on trust. */}
              {open && (
                <div
                  className="mb-2.5 ml-[10px] pl-3"
                  style={{ borderLeft: '1px solid var(--rule)' }}
                >
                  <p className="sign-label tint-muted mt-1 mb-1">In</p>
                  {m.incomeLines.length === 0 && <p className="row-note">nothing coming in</p>}
                  {m.incomeLines.map((l) => (
                    <div key={l.id} className="flex items-baseline gap-2 py-1">
                      <span className="row-note flex-1">{l.label}</span>
                      <span>{php(l.amount)}</span>
                    </div>
                  ))}

                  <p className="sign-label tint-muted mt-2.5 mb-1">Out</p>
                  {m.costLines.map((l) => (
                    <div key={l.id} className="flex items-baseline gap-2 py-1">
                      <span className="row-note flex-1">{l.label}</span>
                      <span>{php(l.amount)}</span>
                    </div>
                  ))}

                  <p className="row-meta mt-2">
                    {m.phaseLabel} · {m.costLines.length} lines
                  </p>
                </div>
              )}
            </div>
          );
        })}

        <div className="flex items-baseline gap-2 pt-3">
          <span className="sign-label tint-muted" style={{ width: 66 }}>
            {only ? 'Phase' : 'All'}
          </span>
          <span className="flex-1 text-right">{php(totalIn)}</span>
          <span className="flex-1 text-right">{php(totalOut)}</span>
          <span className="tint-brick flex-1 text-right">−{php(shownGap)}</span>
        </div>
      </div>

      {/* Reserves are drawn on across the whole plan, so this half never
          narrows to a phase — it would be meaningless split up. */}
      <div className="mt-4 border-t pt-2" style={{ borderColor: 'var(--rule)' }}>
        {only && (
          <p className="row-meta mb-1">across all {flow.months.length} months, not just this phase</p>
        )}
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
