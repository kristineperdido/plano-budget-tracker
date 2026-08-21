'use client';

import { php } from '@/lib/model';
import { Card, Aside } from '@/components/Screen';
import type { Cashflow } from '@/lib/cashflow';

/**
 * Where the money for each month actually comes from.
 *
 * The net figure above this answers "does it balance overall". It cannot answer
 * "is there anything left to pay with in March", because it pours income,
 * savings and a promised repayment into one bucket. This lays the months out in
 * order and draws reserves down by how much they can be relied on, so a plan
 * that balances on paper but runs dry in month two says so.
 */
export function CashflowPanel({ flow, potLabel }: { flow: Cashflow; potLabel?: string }) {
  const worst = flow.firstMonthShort ?? flow.firstMonthNeedingUncertain;

  return (
    <Card title="Where each month is paid from" tape="left">
      {flow.months.map((m) => {
        const covered = m.gap >= 0;
        return (
          <div key={m.month} className="row flex-wrap">
            <span className="num tint-muted w-[62px] text-[12px]">{m.month}</span>
            <span className="row-label">
              {covered ? 'covered by income' : `income short by ${php(-m.gap)}`}
              <span className="row-meta block">
                in {php(m.income)} · out {php(m.out)}
                {m.phaseLabel && ` · ${m.phaseLabel.toLowerCase()}`}
              </span>
              {!covered && (
                <span className="row-meta block">
                  {m.short
                    ? 'nothing left to cover it'
                    : m.needsBackup
                      ? 'drawn from the backup savings'
                      : m.needsUncertain
                        ? 'drawn from money that is not certain'
                        : 'drawn from savings in hand'}
                </span>
              )}
            </span>
            <span
              className={`num text-[14px] ${
                m.short ? 'tint-brick' : m.needsUncertain || m.needsBackup ? 'tint-gold' : covered ? 'tint-green' : ''
              }`}
            >
              {php(m.committedLeft)}
            </span>
          </div>
        );
      })}

      <div className="leader mt-3 border-t pt-2.5" style={{ borderColor: 'var(--rule)' }}>
        <span className="sign-label">In hand at the end</span>
        <span className="leader-fill" aria-hidden />
        <span className={`num text-[17px] ${flow.endsWith >= 0 ? 'tint-green' : 'tint-brick'}`}>
          {php(flow.endsWith)}
        </span>
      </div>

      <div className="mt-2">
        <div className="row">
          <span className="row-label">Money you can count on</span>
          <span className="num text-[13px]">{php(flow.reserves.committed)}</span>
        </div>
        {flow.reserves.uncertain > 0 && (
          <div className="row">
            <span className="row-label">
              Uncertain
              <span className="row-meta block">
                {flow.firstMonthNeedingUncertain
                  ? `needed from ${flow.firstMonthNeedingUncertain}`
                  : 'not needed by this plan'}
              </span>
            </span>
            <span className="num tint-gold text-[13px]">{php(flow.reserves.uncertain)}</span>
          </div>
        )}
        {flow.reserves.backup > 0 && (
          <div className="row">
            <span className="row-label">
              Held back
              <span className="row-meta block">not part of the plan</span>
            </span>
            <span className="num tint-muted text-[13px]">{php(flow.reserves.backup)}</span>
          </div>
        )}
      </div>

      {flow.firstMonthShort ? (
        <Aside tilt={-1.5} tint="brick" className="mt-3">
          {flow.firstMonthShort} cannot be paid for, even after everything is drawn on
        </Aside>
      ) : flow.firstMonthNeedingUncertain ? (
        <Aside tilt={-1.5} tint="gold" className="mt-3">
          holds only if the uncertain money arrives by {flow.firstMonthNeedingUncertain}
        </Aside>
      ) : (
        <Aside tilt={-1.5} tint="green" className="mt-3">
          clears on money you already have, with {php(flow.endsWith)} to spare
        </Aside>
      )}

      {worst === null && potLabel && (
        <p className="row-meta mt-1">
          anything underspent on food goes to {potLabel.toLowerCase()} on top of this
        </p>
      )}
    </Card>
  );
}
