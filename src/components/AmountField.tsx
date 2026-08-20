'use client';

import { useRef, useState } from 'react';

/**
 * Inline numeric editor. While focused it keeps its own draft, so typing "1" on
 * the way to "1500" doesn't momentarily rewrite the plan. A null draft means
 * "not editing — show whatever the config currently says", which also lets a
 * change made on the other phone appear without a stale local copy fighting it.
 */
export function AmountField({
  value,
  onCommit,
  width = '5.5rem',
  label,
  prefix = '₱',
}: {
  value: number;
  onCommit: (next: number) => void;
  width?: string;
  label: string;
  prefix?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  // blur() fires before a setState from the same keydown has flushed, so the
  // cancel intent has to live somewhere synchronous.
  const cancelled = useRef(false);

  function commit() {
    const raw = draft;
    setDraft(null);
    if (cancelled.current) {
      cancelled.current = false;
      return;
    }
    if (raw === null) return;
    const next = Number(raw);
    if (Number.isFinite(next) && next >= 0 && next !== value) onCommit(next);
  }

  return (
    <span className="inline-flex items-baseline">
      {prefix && <span className="num tint-muted text-[0.8rem]">{prefix}</span>}
      <input
        aria-label={label}
        className="field text-[0.88rem]"
        style={{ width }}
        inputMode="decimal"
        value={draft ?? String(value)}
        onFocus={() => setDraft(String(value))}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') {
            cancelled.current = true;
            e.currentTarget.blur();
          }
        }}
      />
    </span>
  );
}
