'use client';

import { php } from '@/lib/model';
import { Card, Aside } from '@/components/Screen';
import type { Envelope } from '@/lib/envelope';

/**
 * The side pot. Every day that finishes under its limit tips the remainder in
 * here rather than raising tomorrow's allowance — so the daily figure stays
 * steady and cooking at home turns visibly into something to spend later.
 */
export function PotPanel({
  envelope,
  label,
  onSpend,
}: {
  envelope: Envelope;
  label: string;
  onSpend: () => void;
}) {
  const yesterday = envelope.days[envelope.days.length - 2];

  return (
    <Card title={label} amount={php(envelope.pot)} tape="right">
      {envelope.pot <= 0 ? (
        <p className="empty py-2">
          nothing set aside yet — come in under a day and it lands here
        </p>
      ) : (
        <>
          <div className="pace">
            <div
              className="pace-fill"
              style={{
                width: `${Math.min(envelope.pot / Math.max(envelope.dailyLimit * 4, 1), 1) * 100}%`,
                background: 'var(--gold)',
              }}
            />
          </div>
          <div className="mt-1.5 flex items-baseline justify-between gap-3">
            <span className="tint-muted text-[11px]">
              {yesterday && yesterday.toPot > 0
                ? `${php(yesterday.toPot)} added yesterday`
                : 'built from days that came in under'}
            </span>
            <button type="button" className="chip" onClick={onSpend}>
              Spend from it
            </button>
          </div>
          <Aside tilt={-1.5} tint="green" className="mt-2">
            banked into savings at the end of the month if you don&rsquo;t use it
          </Aside>
        </>
      )}
    </Card>
  );
}
