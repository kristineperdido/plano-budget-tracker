'use client';

import { useEffect, useMemo, useState } from 'react';
import { addDays, relativeDate } from '@/lib/date';
import { php } from '@/lib/model';
import { type FoodConfig } from '@/lib/config';
import { Aside } from '@/components/Screen';
import { PersonTag } from '@/components/Payer';
import { useSession } from '@/components/AuthGate';
import { fetchMembers, type Member } from '@/lib/members';
import type { Category } from '@/lib/types';

type NewEntry = { spent_on: string; category: Category; amount: number; note?: string };

/**
 * Logging opens day-type-first: one tap covers most nights. The itemise route
 * is there for the odd day that does not fit a shape — a big grocery run, a
 * split bill — and drops to per-category amounts instead.
 */
export function LogSheet({
  today,
  food,
  buffer,
  onClose,
  onSave,
}: {
  today: string;
  food: FoodConfig;
  /** What is left in the month's buffer, so the sheet can warn before it tips. */
  buffer: number;
  onClose: () => void;
  onSave: (rows: NewEntry[]) => Promise<void>;
}) {
  const [mode, setMode] = useState<'day' | 'items'>('day');
  const [dayTypeId, setDayTypeId] = useState<string | null>(null);
  const [extraIds, setExtraIds] = useState<string[]>([]);
  const [day, setDay] = useState(today);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const session = useSession();

  // Itemised mode.
  const [category, setCategory] = useState<Category>(food.categories[0]?.id ?? 'meals');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetchMembers().then((m) => {
      if (!cancelled) setMembers(m);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const dayType = food.dayTypes.find((t) => t.id === dayTypeId) ?? null;
  const chosenExtras = food.extras.filter((e) => extraIds.includes(e.id));

  const dayRows = useMemo<NewEntry[]>(() => {
    if (!dayType) return [];
    const known = new Set(food.categories.map((c) => c.id));
    return [
      { spent_on: day, category: 'meals', amount: dayType.amount, note: dayType.label },
      ...chosenExtras.map((e) => ({
        spent_on: day,
        // An extra files under its own category when one exists, so the ledger
        // keeps coffee separate from meals rather than blurring them together.
        category: known.has(e.id) ? e.id : 'extras',
        amount: e.cost,
        note: known.has(e.id) ? undefined : e.label,
      })),
    ];
  }, [dayType, chosenExtras, day, food.categories]);

  const itemValue = Number(amount);
  const itemValid = amount.trim() !== '' && Number.isFinite(itemValue) && itemValue >= 0;
  const total =
    mode === 'day' ? dayRows.reduce((s, r) => s + r.amount, 0) : itemValid ? itemValue : 0;
  const canSave = mode === 'day' ? dayRows.length > 0 : itemValid;
  const overBy = total - buffer;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave || saving) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(
        mode === 'day'
          ? dayRows
          : [{ spent_on: day, category, amount: itemValue, note: note || undefined }],
      );
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.');
      setSaving(false);
    }
  }

  const dayOptions = [today, addDays(today, -1), addDays(today, -2)];

  return (
    <>
      <button type="button" className="scrim" aria-label="Close" onClick={onClose} />
      <form className="sheet" onSubmit={submit} role="dialog" aria-modal="true" aria-label="Log a day">
        <span className="tape" style={{ left: 30 }} aria-hidden />
        <span className="tape tape-r" style={{ right: 34 }} aria-hidden />

        <div className="mb-1 flex items-baseline justify-between">
          <h2 className="sign text-[17px]">
            {mode === 'day' ? 'What kind of day?' : 'Itemise'}
          </h2>
          <button type="button" onClick={onClose} className="tint-muted text-[12px] underline">
            close
          </button>
        </div>

        {mode === 'day' ? (
          <>
            <Aside tilt={-1.5} className="mb-3 text-[17px]">
              pick one, I&rsquo;ll fill the amount
            </Aside>

            <div className="flex flex-col">
              {food.dayTypes.map((t) => {
                const on = t.id === dayTypeId;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setDayTypeId(on ? null : t.id)}
                    aria-pressed={on}
                    className="mb-1.5 flex items-center justify-between border px-3 py-3.5 text-left"
                    style={{
                      borderColor: on ? 'var(--ink)' : 'var(--rule)',
                      background: on ? 'var(--ink)' : 'transparent',
                      color: on ? 'var(--paper)' : 'var(--ink)',
                    }}
                  >
                    <span className="text-[14px]">{t.label}</span>
                    <span className="num text-[14px]">{php(t.amount)}</span>
                  </button>
                );
              })}
            </div>

            {food.extras.length > 0 && (
              <div className="mt-3">
                {food.extras.map((e) => {
                  const on = extraIds.includes(e.id);
                  return (
                    <div key={e.id} className="row">
                      <span className="row-label">{e.label} today?</span>
                      <button
                        type="button"
                        className="toggle"
                        data-on={on}
                        aria-pressed={on}
                        aria-label={`${e.label} today`}
                        onClick={() =>
                          setExtraIds((prev) =>
                            on ? prev.filter((x) => x !== e.id) : [...prev, e.id],
                          )
                        }
                      >
                        <span className="toggle-knob" />
                      </button>
                      <span className="num tint-muted w-[54px] text-right text-[13px]">
                        +{php(e.cost)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="mb-4 flex flex-wrap gap-1.5">
              {food.categories.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="chip"
                  data-on={category === c.id}
                  aria-pressed={category === c.id}
                  onClick={() => setCategory(c.id)}
                >
                  {c.label}
                </button>
              ))}
            </div>

            <label className="mb-4 block">
              <span className="sign-label tint-teal">Amount</span>
              <span
                className="mt-1 flex items-baseline gap-2 border-b pb-1"
                style={{ borderColor: 'var(--rule)' }}
              >
                <span className="num text-[26px]">₱</span>
                <input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  inputMode="decimal"
                  placeholder="0"
                  autoFocus
                  aria-label="Amount in pesos"
                  className="num w-full bg-transparent text-[26px] outline-none"
                />
              </span>
            </label>

            <label className="mb-4 block">
              <span className="sign-label tint-teal">Note</span>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="optional"
                className="field-text mt-1"
              />
            </label>
          </>
        )}

        <div className="mt-4 flex gap-1.5">
          {dayOptions.map((d) => (
            <button
              key={d}
              type="button"
              className="chip flex-1"
              data-on={day === d}
              aria-pressed={day === d}
              onClick={() => setDay(d)}
            >
              {relativeDate(d, today)}
            </button>
          ))}
        </div>

        <div className="mt-5 flex items-baseline justify-between">
          <span className="sign-label tint-teal">Logging</span>
          <span className="num text-[29px]">{php(total)}</span>
        </div>

        {/* Attribution is set by the database from the signed-in address, so it
            is reported here rather than offered as a choice. */}
        <div className="mt-1 flex items-center gap-2">
          <span className="tint-muted text-[11.5px]">logged by</span>
          <PersonTag person={session.user.email ?? null} me={session.user.email} members={members} />
        </div>

        {overBy > 0 && total > 0 && (
          <Aside tilt={-2} tint="brick" className="mt-2 text-[18px]">
            {php(overBy)} past the buffer
          </Aside>
        )}

        {error && <p className="tint-brick mt-3 text-[12.5px]">{error}</p>}

        <div className="mt-5 flex gap-2.5">
          <button type="submit" disabled={!canSave || saving} className="btn btn--primary flex-[2]">
            {saving ? 'Saving…' : mode === 'day' ? 'Log the day' : 'Log it'}
          </button>
          <button
            type="button"
            className="btn btn--ghost flex-1"
            onClick={() => setMode((m) => (m === 'day' ? 'items' : 'day'))}
          >
            {mode === 'day' ? 'Itemise' : 'Back'}
          </button>
        </div>
      </form>
    </>
  );
}
