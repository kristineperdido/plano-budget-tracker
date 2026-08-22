'use client';

import { useEffect, useState } from 'react';
import { AuthGate, useSession } from '@/components/AuthGate';
import { TabBar } from '@/components/TabBar';
import { Welcome } from '@/components/Welcome';
import { fetchMembers, type Member } from '@/lib/members';
import { fetchConfig } from '@/lib/configStore';
import { fetchEntries } from '@/lib/entries';
import { fetchBills } from '@/lib/bills';
import { fetchSavings } from '@/lib/savings';
import { fetchNoSpendDays } from '@/lib/days';
import { standing as computeStanding, type Standing } from '@/lib/waiting';
import { monthStart, todayISO } from '@/lib/date';

/** Everything behind the gate shares the tab bar. */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      <Greeting />
      {children}
      <TabBar />
    </AuthGate>
  );
}

/**
 * Shown once per launch, over whatever route was opened.
 *
 * Mounted inside the gate so it only ever appears to someone signed in, and
 * mounted once — a client-side route change does not bring it back.
 */
function Greeting() {
  const session = useSession();
  const [show, setShow] = useState(true);
  const [members, setMembers] = useState<Member[]>([]);
  const [standing, setStanding] = useState<Standing | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const today = todayISO();

    Promise.all([
      fetchConfig(),
      fetchMembers(),
      // The month so far is enough for everything the screen reports, and
      // small — this is the same data Today is fetching alongside it.
      fetchEntries(monthStart(today), today),
      fetchBills(),
      fetchSavings(),
      fetchNoSpendDays(monthStart(today), today),
    ]).then(
      ([loaded, m, entries, bills, savings, noSpend]) => {
        if (cancelled) return;
        setMembers(m);
        setStanding(computeStanding(loaded.config, today, entries, bills, savings, noSpend));
        setReady(true);
      },
      () => {
        // A greeting is not worth blocking the app for; go straight through.
        if (!cancelled) setReady(true);
      },
    );

    return () => {
      cancelled = true;
    };
  }, []);

  if (!show) return null;

  return (
    <Welcome
      standing={standing}
      me={session.user.email}
      members={members}
      ready={ready}
      onDone={() => setShow(false)}
    />
  );
}
