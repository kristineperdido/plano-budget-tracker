import assert from 'node:assert/strict';
import { computeEnvelope } from '@/lib/envelope';
import type { FoodEntry } from '@/lib/types';

let n = 0;
const FROM_FIRST = { startDate: '2026-09-01' };

/** Days 1..n of September, marked as accounted-for quiet days. */
const quietThrough = (n: number) =>
  Array.from({ length: n }, (_, i) => `2026-09-${String(i + 1).padStart(2, '0')}`);

function entry(day: string, amount: number, from_pot = false): FoodEntry {
  return {
    id: `e${n++}`,
    spent_on: day,
    category: 'meals',
    amount,
    note: null,
    person: null,
    share: null,
    owed_amount: null,
    settled_at: null,
    from_pot,
    created_at: `${day}T00:00:00Z`,
  };
}

const round = (x: number) => Math.round(x * 100) / 100;

// ---- 1. The worked example, pinned exactly ----
// ₱500/day across a 30-day month. Quiet days sweep to the pot and leave the
// limit untouched; a bulk buy on day 5 drops it for good.
{
  const entries = [
    entry('2026-09-02', 480),
    entry('2026-09-04', 450),
    entry('2026-09-05', 2000), // the bulk grocery run
  ];
  // Days 1, 3 and 6 have no entries, so they only sweep once someone has said
  // nothing was spent on them.
  const e = computeEnvelope(entries, '2026-09-07', 500, {
    ...FROM_FIRST,
    noSpendDays: ['2026-09-01', '2026-09-03', '2026-09-06'],
  });

  const expected = [
    // day, limit, spent, toPot, poolAfter, potAfter
    [1, 500, 0, 500, 14500, 500],
    [2, 500, 480, 20, 14000, 520],
    [3, 500, 0, 500, 13500, 1020],
    [4, 500, 450, 50, 13000, 1070],
    [5, 500, 2000, 0, 11000, 1070],
    [6, 440, 0, 440, 10560, 1510],
  ];

  for (const [d, limit, spent, toPot, pool, pot] of expected) {
    const s = e.days[(d as number) - 1];
    assert.equal(round(s.limit), limit, `day ${d} limit`);
    assert.equal(round(s.spent), spent, `day ${d} spent`);
    assert.equal(round(s.toPot), toPot, `day ${d} swept to pot`);
    assert.equal(round(s.poolAfter), pool, `day ${d} pool`);
    assert.equal(round(s.potAfter), pot, `day ${d} pot`);
  }

  // Day 7 is today: it has not swept yet, so the pot is still day 6's.
  assert.equal(round(e.dailyLimit), 440, 'today inherits the reduced limit');
  assert.equal(round(e.leftToday), 440);
  assert.equal(round(e.pot), 1510, 'today has not swept into the pot yet');
}

// ---- 2. A quiet day leaves the limit exactly where it was ----
{
  const confirmed = Array.from({ length: 10 }, (_, i) => `2026-09-0${i + 1}`.slice(0, 10));
  const flat = computeEnvelope([], '2026-09-10', 500, {
    ...FROM_FIRST,
    noSpendDays: confirmed,
  });
  for (const d of flat.days) {
    assert.equal(round(d.limit), 500, 'confirmed quiet days keep the limit level');
  }
}

// ---- 3. Overspending lowers every remaining day, permanently ----
{
  const quiet = ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04'];
  // The baseline has to account for day 5 too, otherwise its money stays in the
  // pool and lifts the limit — which is the new rule working, not a level month.
  const before = computeEnvelope([], '2026-09-06', 500, {
    ...FROM_FIRST,
    noSpendDays: [...quiet, '2026-09-05'],
  }).dailyLimit;
  const after = computeEnvelope([entry('2026-09-05', 2000)], '2026-09-06', 500, {
    ...FROM_FIRST,
    noSpendDays: quiet,
  }).dailyLimit;
  assert.equal(round(before), 500);
  assert.equal(round(after), 440);

  // And it stays down rather than creeping back on quiet days.
  const later = computeEnvelope([entry('2026-09-05', 2000)], '2026-09-20', 500, {
    ...FROM_FIRST,
    noSpendDays: [...quiet, ...Array.from({ length: 14 }, (_, i) => `2026-09-${String(i + 6).padStart(2, '0')}`)],
  });
  assert.equal(round(later.dailyLimit), 440, 'still 440 a fortnight later');
}

// ---- 4. pool + pot is always budget − spent ----
{
  const entries = [
    entry('2026-09-02', 480),
    entry('2026-09-05', 2000),
    entry('2026-09-09', 123.45),
  ];
  for (const day of ['2026-09-03', '2026-09-10', '2026-09-30']) {
    const e = computeEnvelope(entries, day, 500, { ...FROM_FIRST, noSpendDays: quietThrough(30) });
    assert.equal(
      round(e.pool + e.pot),
      round(e.monthlyBudget - e.spentMonth),
      `conservation holds on ${day}`,
    );
    assert.equal(round(e.leftThisMonth), round(e.monthlyBudget - e.spentMonth));
  }
}

// ---- 4b. Nothing is tracked before the start date ----
{
  const e = computeEnvelope([], '2026-08-21', 500, { startDate: '2026-09-15' });
  assert.equal(e.started, false, 'August is not being tracked yet');
  assert.equal(e.pot, 0, 'and no pot has been invented for it');
  assert.equal(e.days.length, 0);
}

// ---- 4c. A mid-month move-in pro-rates that month ----
{
  const e = computeEnvelope([], '2026-09-15', 500, { startDate: '2026-09-15' });
  assert.equal(e.started, true);
  assert.equal(e.daysCovered, 16, '15th to 30th inclusive');
  assert.equal(e.monthlyBudget, 8000, 'not a full month of 15,000');
  assert.equal(round(e.dailyLimit), 500, 'but the daily figure is still 500');
  assert.equal(e.days.length, 1, 'the month starts on the 15th, not the 1st');
}

// ---- 4d. An unaccounted day keeps its money instead of inventing pot ----
{
  const forgotten = computeEnvelope([], '2026-09-20', 500, { startDate: '2026-09-15' });
  assert.equal(forgotten.pot, 0, 'forgetting to log cannot manufacture savings');
  assert.equal(forgotten.unaccounted.length, 5, 'the 15th to the 19th are unaccounted');
  assert.equal(round(forgotten.pool), 8000, 'the money is all still in the pool');
  // It is not lost — it lifts what is available per day for the days that remain.
  assert.equal(round(forgotten.dailyLimit), 727.27);

  // Confirming those same days instead moves the money sideways into the pot.
  const confirmed = computeEnvelope([], '2026-09-20', 500, {
    startDate: '2026-09-15',
    noSpendDays: ['2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18', '2026-09-19'],
  });
  assert.equal(round(confirmed.pot), 2500);
  assert.equal(round(confirmed.dailyLimit), 500, 'and the limit stays level');

  // Either way the month is worth the same.
  assert.equal(round(forgotten.leftThisMonth), round(confirmed.leftThisMonth));
  assert.equal(round(forgotten.leftThisMonth), 8000);
}

// ---- 5. By the last day the pool is empty and the pot holds the surplus ----
// This is what makes the month-end sweep to savings correct: the pot balance
// and closeMonth's `foodSaved` are the same number.
{
  const entries = [entry('2026-09-02', 480), entry('2026-09-05', 2000)];
  const all = Array.from({ length: 30 }, (_, i) => `2026-09-${String(i + 1).padStart(2, '0')}`);
  const e = computeEnvelope(entries, '2026-09-30', 500, { ...FROM_FIRST, noSpendDays: all });
  assert.equal(round(e.pool), round(e.dailyLimit), 'the last day holds the remainder');
  assert.equal(round(e.pot + e.pool), round(15000 - 2480));
}

// ---- 6. Pot purchases do not touch the day's limit ----
{
  const day = '2026-09-10';
  // The nine days before have to be accounted for, or their money stays in the
  // pool and today's limit comes out above 500.
  const opts = { ...FROM_FIRST, noSpendDays: quietThrough(9) };
  const normal = computeEnvelope([entry(day, 300)], day, 500, opts);
  const fromPot = computeEnvelope([entry(day, 300, true)], day, 500, opts);

  assert.equal(round(normal.leftToday), 200, 'a normal purchase spends the day');
  assert.equal(round(fromPot.leftToday), 500, 'a pot purchase leaves the day alone');
  // Either way the month is down by the same amount.
  assert.equal(round(normal.leftThisMonth), round(fromPot.leftThisMonth));
}

// ---- 7. Spending more than the pot holds falls back to the pool ----
{
  // One quiet day builds a ₱500 pot; a ₱2,000 treat on day 2 outruns it.
  const e = computeEnvelope([entry('2026-09-02', 2000, true)], '2026-09-02', 500, {
    ...FROM_FIRST,
    noSpendDays: quietThrough(1),
  });
  assert.equal(round(e.pot), 0, 'the pot is drained, never negative');
  assert.equal(round(e.leftToday), 500, 'and the overflow does not eat into today');
  assert.equal(round(e.pool), 13000, 'the excess comes out of the pool instead');
  assert.equal(round(e.leftThisMonth), round(15000 - 2000));
}

// ---- 7b. A pot big enough absorbs the whole treat ----
{
  // Nine quiet days build ₱4,500, so a ₱2,000 treat leaves ₱2,500 behind.
  const e = computeEnvelope([entry('2026-09-10', 2000, true)], '2026-09-10', 500, {
    ...FROM_FIRST,
    noSpendDays: quietThrough(9),
  });
  assert.equal(round(e.pot), 2500);
  assert.equal(round(e.leftToday), 500, 'today is untouched either way');
}

// ---- 8. Entries outside the month never leak in ----
{
  const e = computeEnvelope(
    [entry('2026-08-31', 9999), entry('2026-10-01', 9999), entry('2026-09-03', 100)],
    '2026-09-05',
    500,
    FROM_FIRST,
  );
  assert.equal(round(e.spentMonth), 100);
}

console.log('all envelope assertions passed');
