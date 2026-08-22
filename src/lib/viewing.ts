'use client';

import { useCallback, useState } from 'react';
import type { Config } from './config';

/**
 * The phase the reader is currently looking at, shared between Plan and Ledger.
 *
 * It lives outside React because the two screens are never mounted at once:
 * picking a phase on Plan has to still mean something after a route change.
 * Storage is read once, in a state initialiser. That is safe despite these
 * screens being server-rendered: both callers are still waiting on their config
 * during the first render and show a placeholder either way, so the server's
 * null and the client's stored id produce identical markup to hydrate.
 */
const KEY = 'plano.viewed-phase';

/** The sentinel Plan uses for "the whole stretch", which is not a phase id. */
export const ALL = 'all';

export function readViewedPhase(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    // Private browsing and blocked storage both throw rather than return null.
    return null;
  }
}

export function writeViewedPhase(id: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (id === null) window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, id);
  } catch {
    // Not being able to remember the selection is not worth failing a click.
  }
}

/** Backed by storage, so the choice survives moving between tabs. */
export function useViewedPhase(): [string | null, (id: string | null) => void] {
  const [phase, setPhase] = useState(readViewedPhase);

  const set = useCallback((id: string | null) => {
    setPhase(id);
    writeViewedPhase(id);
  }, []);

  return [phase, set];
}

/**
 * Which scheme a phase selection resolves to.
 *
 * Many phases can point at one scheme, so this direction is well defined while
 * the reverse is not — one scheme cannot say which phase you came from. That
 * asymmetry is why the Ledger names the scheme and lists its phases rather than
 * claiming to be showing a phase.
 */
export function schemeForViewed(config: Config, viewed: string | null): string | null {
  if (!viewed || viewed === ALL) return null;
  const phase = config.phases.find((p) => p.id === viewed);
  if (!phase) return null;
  return config.schemes.some((s) => s.id === phase.schemeId) ? phase.schemeId : null;
}

/** Every phase governed by a scheme, in the order they run. */
export function phasesUsing(config: Config, schemeId: string): Config['phases'] {
  return config.phases
    .filter((p) => p.schemeId === schemeId)
    .slice()
    .sort((a, b) => a.from.localeCompare(b.from));
}
