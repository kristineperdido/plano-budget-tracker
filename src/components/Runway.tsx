'use client';

import { php } from '@/lib/model';
import { Aside } from '@/components/Screen';
import type { Cashflow, MonthFlow } from '@/lib/cashflow';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function pretty(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

/** Which kind of money pays for a month. Ordered worst-last. */
function fundedBy(m: MonthFlow): 'income' | 'committed' | 'uncertain' | 'backup' | 'short' {
  if (m.short) return 'short';
  if (m.needsBackup) return 'backup';
  if (m.needsUncertain) return 'uncertain';
  if (m.gap < 0) return 'committed';
  return 'income';
}

const KEY: { k: ReturnType<typeof fundedBy>; label: string }[] = [
  { k: 'income', label: 'income covers it' },
  { k: 'committed', label: 'savings in hand' },
  { k: 'uncertain', label: 'money that might not come' },
  { k: 'backup', label: 'the reserve' },
  { k: 'short', label: 'nothing covers it' },
];

/**
 * How long the money lasts, as the headline.
 *
 * The combined net used to lead this screen, and it is a poor answer to the
 * question actually being asked: it mixes one-off costs with recurring ones,
 * counts savings as though they were income, and says nothing about *when*
 * things go wrong. A plan can be net positive and still run dry in month two.
 */
export function Runway({ flow }: { flow: Cashflow }) {
  const used = new Set(flow.months.map(fundedBy));
  const ran = flow.firstMonthShort !== null;

  return (
    <section className="pb-2">
      {/* Full-bleed so the month sits on the page's midline. Everything below
          stays in the content gutter — a full-width bar here would run through
          the red margin rule at 34px. */}
      <div
        className="pt-5"
        style={{ marginLeft: -44, marginRight: -16, paddingLeft: 16, paddingRight: 16 }}
      >
      <p className="sign-label tint-teal text-center" style={{ letterSpacing: '0.2em' }}>
        {ran ? 'Runs dry in' : 'Lasts until'}
      </p>

      <p
        className={`sign mt-2 text-center ${ran ? 'tint-brick' : 'tint-green'}`}
        style={{ fontSize: 40, lineHeight: 1.05, letterSpacing: '0.02em' }}
      >
        {ran ? pretty(flow.firstMonthShort as string) : flow.lastsUntil ? pretty(flow.lastsUntil) : '—'}
      </p>

      <p className="tint-muted mt-1.5 text-center text-[12.5px]">
        {flow.monthsCovered} of {flow.months.length} months covered
      </p>
      </div>

      <div className="runway mt-4" role="img" aria-label={`${flow.monthsCovered} of ${flow.months.length} months covered`}>
        {flow.months.map((m) => (
          <span key={m.month} className={`runway-seg runway-seg--${fundedBy(m)}`} title={m.month} />
        ))}
      </div>

      <div className="mt-1.5 flex justify-between">
        <span className="num tint-muted text-[11px]">{pretty(flow.months[0]?.month ?? '')}</span>
        <span className="num tint-muted text-[11px]">
          {pretty(flow.months[flow.months.length - 1]?.month ?? '')}
        </span>
      </div>

      <div className="runway-key mt-3">
        {KEY.filter((k) => used.has(k.k)).map((k) => (
          <span key={k.k} className="runway-key-item">
            <span className={`runway-swatch runway-seg--${k.k}`} aria-hidden />
            <span className="tint-muted text-[11px]">{k.label}</span>
          </span>
        ))}
      </div>

      {ran ? (
        <Aside tilt={-1.5} tint="brick" className="mt-3">
          {flow.lastsUntil
            ? `covered through ${pretty(flow.lastsUntil)}, then nothing pays for ${pretty(flow.firstMonthShort as string)}`
            : `the first month cannot be paid for`}
        </Aside>
      ) : flow.firstMonthNeedingUncertain ? (
        <Aside tilt={-1.5} tint="gold" className="mt-3">
          money in hand runs out in {pretty(flow.firstMonthNeedingUncertain)} — after that it
          leans on money you can&rsquo;t count on
        </Aside>
      ) : (
        <Aside tilt={-1.5} tint="green" className="mt-3">
          clears on money you already have, with {php(flow.endsWith)} to spare
        </Aside>
      )}
    </section>
  );
}
