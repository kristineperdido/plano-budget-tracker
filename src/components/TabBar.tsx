'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';

const TABS = [
  { href: '/', label: 'Today' },
  { href: '/plan', label: 'Plan' },
  { href: '/ledger', label: 'Ledger' },
  { href: '/food', label: 'Food' },
];

/** Nine screens do not fit four tabs, so the rest live behind MORE. */
const MORE = [
  { href: '/what-if', label: 'What-if', note: 'drag the numbers, nothing saves' },
  { href: '/pending', label: 'Pending', note: 'known, but not yet priced' },
  { href: '/log', label: 'Log', note: 'every change, newest first' },
  { href: '/settings', label: 'Settings', note: 'people, phases, categories' },
];

export function TabBar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const moreActive = MORE.some((m) => m.href === pathname);

  return (
    <>
      {open && (
        <>
          <button
            type="button"
            className="scrim"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
          />
          <div className="sheet" role="dialog" aria-label="More screens">
            <h2 className="sign-label tint-teal mb-3">More</h2>
            {MORE.map((m) => (
              <Link
                key={m.href}
                href={m.href}
                onClick={() => setOpen(false)}
                className="row no-underline"
                style={{ color: 'var(--ink)' }}
              >
                <span className="flex-1">
                  <span className="sign block text-[13px]">{m.label}</span>
                  <span className="row-meta">{m.note}</span>
                </span>
                <span className="tint-muted num text-[13px]">→</span>
              </Link>
            ))}
            <button
              type="button"
              className="btn btn--ghost mt-4"
              onClick={() => void supabase.auth.signOut()}
            >
              Sign out
            </button>
          </div>
        </>
      )}

      <nav className="tabs" aria-label="Screens">
        {TABS.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className="tab"
            aria-current={pathname === t.href ? 'page' : undefined}
          >
            {t.label}
          </Link>
        ))}
        <button
          type="button"
          className="tab"
          aria-current={moreActive ? 'page' : undefined}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          More
        </button>
      </nav>
    </>
  );
}
