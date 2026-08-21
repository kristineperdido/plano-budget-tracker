'use client';

import { useState } from 'react';
import { php } from '@/lib/model';
import { personLabel, type Member } from '@/lib/members';
import { PayerMark, shapeForPerson } from '@/components/Payer';
import { Aside } from '@/components/Screen';
import type { Settlement } from '@/lib/close';

/**
 * Who owes whom right now. Only rendered when something is actually
 * outstanding — a couple with nothing to square should not be shown a zero.
 */
export function SettlementPanel({
  settlement,
  me,
  members,
  onSettle,
}: {
  settlement: Settlement;
  me: string | undefined;
  members: Member[];
  onSettle: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);

  if (!settlement.creditor || settlement.amount <= 0) return null;

  const creditor = personLabel(settlement.creditor, me, members) ?? 'they';
  const owedToMe = me && settlement.creditor.toLowerCase() === me.toLowerCase();

  return (
    <div className="panel mt-4">
      <div className="leader mb-1.5">
        <h2 className="sign-label tint-teal">Between you</h2>
        <span className="leader-fill" aria-hidden />
      </div>

      <div className="flex items-center gap-2.5">
        <PayerMark shape={shapeForPerson(settlement.creditor, members)} />
        <span className="row-label">
          {owedToMe ? 'you are owed' : `owed to ${creditor}`}
        </span>
        <span className="num text-[20px]">{php(settlement.amount)}</span>
      </div>

      <Aside tilt={-1.5} className="mt-1.5">
        from purchases marked as shared
      </Aside>

      <button
        type="button"
        className="btn btn--ghost mt-3"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await onSettle();
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? 'Squaring up…' : 'Settled up'}
      </button>
    </div>
  );
}
