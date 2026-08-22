'use client';

import { useEffect, useState } from 'react';
import { PersonTag } from '@/components/Payer';
import type { Member } from '@/lib/members';
import type { Standing } from '@/lib/waiting';

/** Long enough to read, short enough not to be in the way. */
const MIN_MS = 1100;
/** However slow the network is, the app is never held behind this. */
const MAX_MS = 4000;

/**
 * What you see while the app opens: who you are signed in as, where you are in
 * the plan, and anything waiting on you.
 *
 * It occupies time the app already spends loading rather than adding any, and
 * it leaves on its own — a screen you have to dismiss every launch becomes a
 * door within a week. The one number is deliberately not here: this is
 * context, and Today underneath is the number.
 */
export function Welcome({
  standing,
  me,
  members,
  ready,
  onDone,
}: {
  standing: Standing | null;
  me: string | undefined;
  members: Member[];
  /** True once the data behind it has arrived. */
  ready: boolean;
  onDone: () => void;
}) {
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const started = Date.now();
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      setLeaving(true);
      window.setTimeout(onDone, 260);
    };

    // Leave once the data is in and it has been up long enough to read —
    // whichever is later — but never later than the cap.
    const wait = ready ? Math.max(0, MIN_MS - (Date.now() - started)) : MIN_MS;
    const soon = window.setTimeout(finish, wait);
    const cap = window.setTimeout(finish, MAX_MS);
    return () => {
      window.clearTimeout(soon);
      window.clearTimeout(cap);
    };
  }, [ready, onDone]);

  return (
    <button
      type="button"
      aria-label="Continue"
      onClick={() => {
        setLeaving(true);
        window.setTimeout(onDone, 200);
      }}
      className="fixed inset-0 z-50 flex w-full flex-col items-center justify-center px-8 text-left"
      style={{
        background: 'var(--ink)',
        border: 0,
        opacity: leaving ? 0 : 1,
        transition: 'opacity 240ms linear',
      }}
    >
      <div className="w-full" style={{ maxWidth: '20rem' }}>
        <div className="shutter mb-7 h-[46px] w-full" aria-hidden />

        {me && (
          <div style={{ color: 'var(--paper)' }}>
            <PersonTag person={me} me={undefined} members={members} />
          </div>
        )}

        <p
          className="sign mt-2"
          style={{ fontSize: 30, lineHeight: 1.05, color: 'var(--paper)' }}
        >
          Welcome back
        </p>

        <div className="tarp-stripe mt-4" aria-hidden />

        {standing && (
          <>
            <p className="marker mt-4 text-[21px]" style={{ color: 'var(--gold)' }}>
              {standing.daysUntilStart !== null
                ? standing.daysUntilStart === 0
                  ? 'today is the day you move in'
                  : `${standing.daysUntilStart} ${
                      standing.daysUntilStart === 1 ? 'day' : 'days'
                    } until you move in`
                : standing.monthOfPlan !== null
                  ? `month ${standing.monthOfPlan} of ${standing.totalMonths}${
                      standing.phaseLabel ? ` — ${standing.phaseLabel.toLowerCase()}` : ''
                    }`
                  : 'past the end of the plan'}
            </p>

            {/* Only ever shown when something is genuinely outstanding. */}
            {standing.waiting.length > 0 && (
              <ul className="mt-5" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {standing.waiting.map((w) => (
                  <li
                    key={w.id}
                    className="flex items-baseline gap-2 py-1 text-[13px]"
                    style={{ color: 'var(--paper)' }}
                  >
                    <span aria-hidden style={{ color: 'var(--gold)' }}>
                      ·
                    </span>
                    {w.text}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        <p
          className="mt-7 text-[11px]"
          style={{ letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--charcoal)' }}
        >
          {ready ? 'ready' : 'reading the ledger…'}
        </p>
      </div>
    </button>
  );
}
