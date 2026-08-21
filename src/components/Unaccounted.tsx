'use client';

import { useState } from 'react';
import { relativeDate } from '@/lib/date';
import { Card, Aside } from '@/components/Screen';

/**
 * Finished days nobody logged anything on. Their money is being held in the
 * monthly pool rather than swept into the pot, because silence could mean a
 * frugal day or an unopened app — and guessing wrong would turn forgetting
 * into savings.
 */
export function Unaccounted({
  days,
  today,
  potLabel,
  onConfirm,
}: {
  days: string[];
  today: string;
  potLabel: string;
  onConfirm: (day: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  if (days.length === 0) return null;

  return (
    <Card title="Days to account for">
      <Aside tilt={-1.5} className="mb-2">
        nothing logged on these — say so and the leftover goes to{' '}
        {potLabel.toLowerCase()}
      </Aside>

      {days.slice(-7).map((d) => (
        <div key={d} className="row">
          <span className="row-label">{relativeDate(d, today)}</span>
          <button
            type="button"
            className="chip"
            disabled={busy === d}
            onClick={async () => {
              setBusy(d);
              try {
                await onConfirm(d);
              } finally {
                setBusy(null);
              }
            }}
          >
            {busy === d ? 'Saving…' : 'Nothing spent'}
          </button>
        </div>
      ))}

      {days.length > 7 && (
        <p className="row-meta mt-2">
          and {days.length - 7} more — their money is still in the month, not lost
        </p>
      )}
    </Card>
  );
}
