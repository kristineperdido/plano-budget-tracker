'use client';

import { useEffect, useState } from 'react';
import { Screen, Aside } from '@/components/Screen';
import { PersonTag } from '@/components/Payer';
import { fetchChanges, type Change } from '@/lib/changelog';
import { fetchMembers, type Member } from '@/lib/members';
import { useSession } from '@/components/AuthGate';
import { TZ } from '@/lib/date';

const stamp = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ,
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

export default function LogPage() {
  const [changes, setChanges] = useState<Change[] | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [error, setError] = useState<string | null>(null);
  const session = useSession();

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchChanges(), fetchMembers()]).then(
      ([c, m]) => {
        if (cancelled) return;
        setChanges(c);
        setMembers(m);
      },
      (e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load the log.');
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Screen title="Log" meta={changes ? `${changes.length} changes` : undefined}>
      {error && (
        <p className="tint-brick mt-4 text-[12.5px]" role="alert">
          {error}
        </p>
      )}

      {!changes ? (
        <p className="empty py-16 text-center">reading the log…</p>
      ) : changes.length === 0 ? (
        <p className="empty py-16 text-center">nothing changed yet</p>
      ) : (
        <>
          <Aside tilt={-1.5} className="mt-2 mb-3">
            every change, newest first — nothing here can be edited
          </Aside>

          <ul className="pb-8">
            {changes.map((c) => (
              <li key={c.id} className="row flex-wrap">
                <span className="num tint-muted w-full text-[11.5px]">
                  {stamp.format(new Date(c.created_at))}
                  <span className="float-right">
                    <PersonTag person={c.person} me={session.user.email} members={members} />
                  </span>
                </span>
                <span className="row-label mt-1 w-full">{c.note}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Screen>
  );
}
