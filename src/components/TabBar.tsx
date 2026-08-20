'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

// Only routes that exist. What-if, Pending and Log join this list as they land,
// rather than sitting here as tabs that 404.
const TABS = [
  { href: '/', label: 'Today' },
  { href: '/plan', label: 'Plan' },
  { href: '/ledger', label: 'Ledger' },
  { href: '/food', label: 'Food' },
];

export function TabBar() {
  const pathname = usePathname();
  return (
    <nav className="tabbar" aria-label="Screens">
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} data-active={pathname === t.href}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
