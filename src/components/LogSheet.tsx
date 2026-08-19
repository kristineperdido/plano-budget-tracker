'use client';

import { useEffect, useRef, useState } from 'react';
import { addDays, relativeDate } from '@/lib/date';
import { CATEGORIES, CATEGORY_LABEL, type Category } from '@/lib/types';

export function LogSheet({
  today,
  onClose,
  onSave,
}: {
  today: string;
  onClose: () => void;
  onSave: (v: {
    spent_on: string;
    category: Category;
    amount: number;
    note?: string;
  }) => Promise<void>;
}) {
  const [category, setCategory] = useState<Category>('eatout');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [day, setDay] = useState(today);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const amountRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    amountRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const value = Number(amount);
  const valid = amount.trim() !== '' && Number.isFinite(value) && value >= 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || saving) return;
    setSaving(true);
    setError(null);
    try {
      await onSave({ spent_on: day, category, amount: value, note });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.');
      setSaving(false);
    }
  }

  const dayOptions = [today, addDays(today, -1), addDays(today, -2)];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ background: 'rgb(36 30 21 / 0.35)' }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Log an entry"
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="sheet w-full max-w-md rounded-t-md px-5 pb-8 pt-5"
        style={{ paddingBottom: 'calc(2rem + env(safe-area-inset-bottom))' }}
      >
        <h2 className="serif mb-4 text-center text-[1.05rem]">Log an entry</h2>

        {/* Category */}
        <div className="mb-4 flex gap-2">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              aria-pressed={category === c}
              className="flex-1 rounded-[2px] border py-2 text-[0.82rem] transition-colors"
              style={{
                borderColor: category === c ? 'var(--ink)' : 'var(--rule)',
                background: category === c ? 'var(--ink)' : 'transparent',
                color: category === c ? 'var(--paper-light)' : 'var(--charcoal)',
              }}
            >
              {CATEGORY_LABEL[c]}
            </button>
          ))}
        </div>

        {/* Amount */}
        <label className="mb-4 block">
          <span className="tint-muted text-[0.7rem] uppercase tracking-[0.18em]">
            Amount
          </span>
          <div className="mt-1 flex items-baseline gap-2 border-b pb-1" style={{ borderColor: 'var(--rule)' }}>
            <span className="num text-[1.6rem]">₱</span>
            <input
              ref={amountRef}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              placeholder="0"
              aria-label="Amount in pesos"
              className="num w-full bg-transparent text-[1.6rem] outline-none"
            />
          </div>
        </label>

        {/* Note */}
        <label className="mb-4 block">
          <span className="tint-muted text-[0.7rem] uppercase tracking-[0.18em]">
            Note <span className="normal-case tracking-normal">(optional)</span>
          </span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="jollibee, 7-11 run…"
            className="mt-1 w-full border-b bg-transparent pb-1 text-[0.95rem] outline-none"
            style={{ borderColor: 'var(--rule)' }}
          />
        </label>

        {/* Day */}
        <div className="mb-5 flex gap-2">
          {dayOptions.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDay(d)}
              aria-pressed={day === d}
              className="flex-1 rounded-[2px] border py-1.5 text-[0.75rem]"
              style={{
                borderColor: day === d ? 'var(--ink)' : 'var(--rule)',
                color: day === d ? 'var(--ink)' : 'var(--charcoal)',
              }}
            >
              {relativeDate(d, today)}
            </button>
          ))}
        </div>

        {error && <p className="tint-brick mb-3 text-[0.8rem]">{error}</p>}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="tint-muted flex-1 rounded-[2px] border py-3 text-[0.9rem]"
            style={{ borderColor: 'var(--rule)' }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!valid || saving}
            className="flex-[2] rounded-[2px] py-3 text-[0.9rem] disabled:opacity-40"
            style={{ background: 'var(--ink)', color: 'var(--paper-light)' }}
          >
            {saving ? 'Saving…' : 'Log it'}
          </button>
        </div>
      </form>
    </div>
  );
}
