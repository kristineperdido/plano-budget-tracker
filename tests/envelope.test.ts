import assert from 'node:assert/strict';
import { computeEnvelope } from '@/lib/envelope';
import type { FoodEntry } from '@/lib/types';

let n = 0;
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
  const e = computeEnvelope(entries, '2026-09-07', 500);

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
  const flat = computeEnvelope([], '2026-09-10', 500);
  for (const d of flat.days) {
    assert.equal(round(d.limit), 500, 'no spending at all means a level limit');
  }
}

// ---- 3. Overspending lowers every remaining day, permanently ----
{
  const before = computeEnvelope([], '2026-09-06', 500).dailyLimit;
  const after = computeEnvelope([entry('2026-09-05', 2000)], '2026-09-06', 500).dailyLimit;
  assert.equal(round(before), 500);
  assert.equal(round(after), 440);

  // And it stays down rather than creeping back on quiet days.
  const later = computeEnvelope([entry('2026-09-05', 2000)], '2026-09-20', 500);
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
    const e = computeEnvelope(entries, day, 500);
    assert.equal(
      round(e.pool + e.pot),
      round(e.monthlyBudget - e.spentMonth),
      `conservation holds on ${day}`,
    );
    assert.equal(round(e.leftThisMonth), round(e.monthlyBudget - e.spentMonth));
  }
}

// ---- 5. By the last day the pool is empty and the pot holds the surplus ----
// This is what makes the month-end sweep to savings correct: the pot balance
// and closeMonth's `foodSaved` are the same number.
{
  const entries = [entry('2026-09-02', 480), entry('2026-09-05', 2000)];
  const e = computeEnvelope(entries, '2026-09-30', 500);
  assert.equal(round(e.pool), round(e.dailyLimit), 'the last day holds the remainder');
  assert.equal(round(e.pot + e.pool), round(15000 - 2480));
}

// ---- 6. Pot purchases do not touch the day's limit ----
{
  const day = '2026-09-10';
  const normal = computeEnvelope([entry(day, 300)], day, 500);
  const fromPot = computeEnvelope([entry(day, 300, true)], day, 500);

  assert.equal(round(normal.leftToday), 200, 'a normal purchase spends the day');
  assert.equal(round(fromPot.leftToday), 500, 'a pot purchase leaves the day alone');
  // Either way the month is down by the same amount.
  assert.equal(round(normal.leftThisMonth), round(fromPot.leftThisMonth));
}

// ---- 7. Spending more than the pot holds falls back to the pool ----
{
  // One quiet day builds a ₱500 pot; a ₱2,000 treat on day 2 outruns it.
  const e = computeEnvelope([entry('2026-09-02', 2000, true)], '2026-09-02', 500);
  assert.equal(round(e.pot), 0, 'the pot is drained, never negative');
  assert.equal(round(e.leftToday), 500, 'and the overflow does not eat into today');
  assert.equal(round(e.pool), 13000, 'the excess comes out of the pool instead');
  assert.equal(round(e.leftThisMonth), round(15000 - 2000));
}

// ---- 7b. A pot big enough absorbs the whole treat ----
{
  // Nine quiet days build ₱4,500, so a ₱2,000 treat leaves ₱2,500 behind.
  const e = computeEnvelope([entry('2026-09-10', 2000, true)], '2026-09-10', 500);
  assert.equal(round(e.pot), 2500);
  assert.equal(round(e.leftToday), 500, 'today is untouched either way');
}

// ---- 8. Entries outside the month never leak in ----
{
  const e = computeEnvelope(
    [entry('2026-08-31', 9999), entry('2026-10-01', 9999), entry('2026-09-03', 100)],
    '2026-09-05',
    500,
  );
  assert.equal(round(e.spentMonth), 100);
}

console.log('all envelope assertions passed');
