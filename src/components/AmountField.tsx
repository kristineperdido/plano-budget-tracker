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
  width,
  label,
  prefix = '₱',
}: {
  value: number;
  onCommit: (next: number) => void;
  /** Fixed width, for the small integer fields. Amounts size themselves. */
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

  const shown = draft ?? String(value);

  return (
    <span className="amount-editable inline-flex items-baseline">
      {prefix && <span className="num tint-muted text-[12px]">{prefix}</span>}
      <input
        aria-label={label}
        className="field text-[14px]"
        // A fixed width strands the peso sign away from its digits: the text is
        // right-aligned inside a box wider than it needs. `size` is no better —
        // browsers derive it from the font's average character width, which is
        // wider than a digit. In a tabular mono face 1ch is exactly one digit,
        // so this fits the box to the number and the prefix stays attached.
        style={
          width
            ? { width }
            : { width: `calc(${Math.max(3, shown.length)}ch + 3px)`, minWidth: '3ch' }
        }
        inputMode="decimal"
        value={shown}
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
