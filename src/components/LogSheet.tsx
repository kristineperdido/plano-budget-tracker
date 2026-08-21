'use client';

import { useEffect, useMemo, useState } from 'react';
import { addDays, relativeDate } from '@/lib/date';
import { php } from '@/lib/model';
import { type FoodConfig } from '@/lib/config';
import { Aside } from '@/components/Screen';
import { PersonTag } from '@/components/Payer';
import { useSession } from '@/components/AuthGate';
import { fetchMembers, type Member } from '@/lib/members';
import type { Category, Share } from '@/lib/types';

type NewEntry = {
  spent_on: string;
  category: Category;
  amount: number;
  note?: string;
  share?: Share;
  owed_amount?: number | null;
  from_pot?: boolean;
};

/**
 * Logging opens day-type-first: one tap covers most nights. The itemise route
 * is there for the odd day that does not fit a shape — a big grocery run, a
 * split bill — and drops to per-category amounts instead.
 */
export function LogSheet({
  today,
  food,
  leftToday,
  loggedByDay,
  pot,
  potLabel,
  startFromPot,
  defaultShare,
  onClose,
  onSave,
}: {
  today: string;
  food: FoodConfig;
  /** What is left of today's limit, so the sheet can warn before it tips. */
  leftToday: number;
  /** Already logged per day, so a second tap on the same day is caught. */
  loggedByDay: Record<string, number>;
  /** The side pot's balance. */
  pot: number;
  potLabel: string;
  /** Opened from the pot panel, so it starts set to spend from the pot. */
  startFromPot: boolean;
  /** The settlement the couple usually want, from Settings. */
  defaultShare: 'none' | 'half';
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
  const active = food.categories.filter((c) => !c.archived);
  const [category, setCategory] = useState<Category>(active[0]?.id ?? 'meals');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');

  // Settlement, opt-in per log. Defaults to whatever Settings says.
  const [share, setShare] = useState<Share>(defaultShare === 'half' ? 'half' : null);
  const [owed, setOwed] = useState('');
  const [fromPot, setFromPot] = useState(startFromPot);

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
  const owedValue = Number(owed);
  const owedValid = share !== 'fixed' || (owed.trim() !== '' && Number.isFinite(owedValue) && owedValue >= 0);
  const total =
    mode === 'day' ? dayRows.reduce((s, r) => s + r.amount, 0) : itemValid ? itemValue : 0;
  const canSave = (mode === 'day' ? dayRows.length > 0 : itemValid) && owedValid;
  // Money from the pot has already been set aside, so it cannot push today over.
  const overBy = fromPot ? 0 : total - leftToday;
  const overPot = fromPot ? total - pot : 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave || saving) return;
    setSaving(true);
    setError(null);
    try {
      // A 'fixed' amount describes one purchase, so on a whole-day log it is
      // applied to the meal line and the extras are left unshared rather than
      // silently repeating the same figure against each of them.
      const tag = (r: NewEntry): NewEntry => ({ ...r, from_pot: fromPot });
      const rows: NewEntry[] = (
        mode === 'day'
          ? dayRows.map((r, i) =>
              share === 'fixed'
                ? i === 0
                  ? { ...r, share, owed_amount: owedValue }
                  : r
                : { ...r, share },
            )
          : [
              {
                spent_on: day,
                category,
                amount: itemValue,
                note: note || undefined,
                share,
                owed_amount: share === 'fixed' ? owedValue : null,
              },
            ]
      ).map(tag);
      await onSave(rows);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.');
      setSaving(false);
    }
  }

  const dayOptions = [today, addDays(today, -1), addDays(today, -2)];

  // One tap covers most nights, which also makes it easy to tap twice. A day
  // that already has entries is almost always a mistake rather than a second
  // dinner, so say so before it becomes two identical rows.
  const already = loggedByDay[day] ?? 0;
  const duplicate = mode === 'day' && already > 0;

  return (
    <>
      <button type="button" className="scrim" aria-label="Close" onClick={onClose} />
      <form className="sheet" onSubmit={submit} role="dialog" aria-modal="true" aria-label="Log a day">
        <span className="tape tape--sheet" style={{ left: 30 }} aria-hidden />
        <span className="tape tape-r tape--sheet" style={{ right: 34 }} aria-hidden />
        <div className="sheet-body">

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
              {active.map((c) => (
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

        {pot > 0 && (
          <div className="row mt-4">
            <span className="row-label">
              Out of {potLabel.toLowerCase()}
              <span className="row-meta block">{php(pot)} set aside</span>
            </span>
            <button
              type="button"
              className="toggle"
              data-on={fromPot}
              aria-pressed={fromPot}
              aria-label={`Spend from ${potLabel}`}
              onClick={() => setFromPot((v) => !v)}
            >
              <span className="toggle-knob" />
            </button>
          </div>
        )}

        {/* Settlement, opt-in. Most spending is just spending, so the default is
            'mine' and nothing has to be decided to log a normal day. */}
        <div className="mt-5">
          <span className="sign-label tint-teal">Who carries this?</span>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <button
              type="button"
              className="chip chip--marker"
              data-on={share === null}
              aria-pressed={share === null}
              onClick={() => setShare(null)}
            >
              mine
            </button>
            <button
              type="button"
              className="chip chip--marker"
              data-on={share === 'half'}
              aria-pressed={share === 'half'}
              onClick={() => setShare('half')}
            >
              50/50
            </button>
            <button
              type="button"
              className="chip chip--marker"
              data-on={share === 'fixed'}
              aria-pressed={share === 'fixed'}
              onClick={() => setShare('fixed')}
            >
              they owe…
            </button>
          </div>

          {share === 'fixed' && (
            <label className="mt-2 flex items-baseline gap-2">
              <span className="tint-muted text-[11.5px]">they owe me</span>
              <span className="num text-[16px]">₱</span>
              <input
                value={owed}
                onChange={(e) => setOwed(e.target.value)}
                inputMode="decimal"
                placeholder="0"
                aria-label="Amount the other person owes"
                className="field w-[5rem] text-[16px]"
              />
            </label>
          )}

          {share !== null && (
            <p className="row-meta mt-1.5">
              {share === 'half'
                ? `they owe ${php(total / 2)} of this`
                : owedValid && owed.trim() !== ''
                  ? `they owe ${php(owedValue)} of ${php(total)}`
                  : 'set what they owe'}
            </p>
          )}
        </div>

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
            {php(overBy)} past today&rsquo;s limit — comes out of the month
          </Aside>
        )}
        {overPot > 0 && total > 0 && (
          <Aside tilt={-2} tint="gold" className="mt-2 text-[18px]">
            {php(overPot)} more than {potLabel.toLowerCase()} holds — the rest comes out of the
            month
          </Aside>
        )}

        {duplicate && (
          <Aside tilt={-2} tint="gold" className="mt-2 text-[18px]">
            {php(already)} already logged on this day — sure this isn&rsquo;t a second tap?
          </Aside>
        )}

        {error && <p className="tint-brick mt-3 text-[12.5px]">{error}</p>}

        <div className="mt-5 flex gap-2.5">
          <button type="submit" disabled={!canSave || saving} className="btn btn--primary flex-[2]">
            {saving ? 'Saving…' : duplicate ? 'Log anyway' : mode === 'day' ? 'Log the day' : 'Log it'}
          </button>
          <button
            type="button"
            className="btn btn--ghost flex-1"
            onClick={() => setMode((m) => (m === 'day' ? 'items' : 'day'))}
          >
            {mode === 'day' ? 'Itemise' : 'Back'}
          </button>
        </div>
        </div>
      </form>
    </>
  );
}
