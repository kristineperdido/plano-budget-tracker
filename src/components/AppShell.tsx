'use client';

import { AuthGate } from '@/components/AuthGate';
import { TabBar } from '@/components/TabBar';

/** Everything behind the gate shares the tab bar. */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      {children}
      <TabBar />
    </AuthGate>
  );
}
