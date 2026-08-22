import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, type Config } from '@/lib/config';
import { standing } from '@/lib/waiting';
import { daysBetween } from '@/lib/date';
import { billsDueIn } from '@/lib/close';
import type { FoodEntry } from '@/lib/types';

const clone = (c: Config): Config => JSON.parse(JSON.stringify(c));
let n = 0;
const entry = (day: string, amount: number): FoodEntry => ({
  id: `e${n++}`, spent_on: day, category: 'meals', amount, note: null, person: null,
  share: null, owed_amount: null, settled_at: null, from_pot: false,
  created_at: `${day}T00:00:00Z`,
});

// ---- 1. Counting days is calendar arithmetic ----
{
  assert.equal(daysBetween('2026-08-22', '2026-09-15'), 24);
  assert.equal(daysBetween('2026-09-15', '2026-09-15'), 0);
  assert.equal(daysBetween('2026-12-31', '2027-01-01'), 1, 'across a year end');
  assert.equal(daysBetween('2026-02-28', '2026-03-01'), 1, 'and a short month');
}

// ---- 2. Before move-in it counts down and asks nothing of you ----
{
  const s = standing(DEFAULT_CONFIG, '2026-08-22', [], [], [], []);
  assert.equal(s.daysUntilStart, 24);
  assert.equal(s.monthOfPlan, null);
  assert.equal(s.waiting.length, 0, 'nothing can be outstanding before it starts');
}

// ---- 3. Once started it says where you are ----
{
  const s = standing(DEFAULT_CONFIG, '2026-10-05', [], [], [], []);
  assert.equal(s.daysUntilStart, null);
  assert.equal(s.monthOfPlan, 2);
  assert.equal(s.totalMonths, 5);
  assert.equal(s.phaseLabel, 'Between jobs');

  const later = standing(DEFAULT_CONFIG, '2026-12-05', [], [], [], []);
  assert.equal(later.monthOfPlan, 4);
  assert.equal(later.phaseLabel, 'Running on savings', 'and which stretch it falls in');
}

// ---- 4. It stays silent when there is nothing to say ----
{
  // Every day accounted for, every due bill recorded, nothing owed.
  const c = clone(DEFAULT_CONFIG);
  const days = Array.from({ length: 3 }, (_, i) => `2026-09-${15 + i}`);
  // Everything the plan expects that month, one-time move-in costs included —
  // supplying only the recurring ones leaves five unrecorded and it speaks up.
  const bills = billsDueIn(c, '2026-09').map((i) => ({
    id: i.id, item_id: i.id, for_month: '2026-09', amount: i.amount,
    paid_on: '2026-09-16', note: null, person: null,
  }));
  const s = standing(c, '2026-09-18', [], bills, [], days);
  assert.equal(s.waiting.length, 0, `expected nothing, got: ${s.waiting.map((w) => w.text)}`);
}

// ---- 5. Each thing outstanding is named, and only when true ----
{
  const c = clone(DEFAULT_CONFIG);

  // Days 15-17 left untouched, nothing recorded.
  const s = standing(c, '2026-09-18', [], [], [], []);
  const ids = s.waiting.map((w) => w.id);
  assert.ok(ids.includes('unaccounted'), 'days needing an answer');
  assert.ok(ids.includes('bills'), 'bills with no figure');
  assert.ok(!ids.includes('owed'), 'nothing owed yet');

  // Mark one purchase as shared and it appears.
  const shared: FoodEntry = { ...entry('2026-09-16', 400), person: 'tin@x.com', share: 'half' };
  const withDebt = standing(c, '2026-09-18', [shared], [], [], []);
  assert.ok(withDebt.waiting.some((w) => w.id === 'owed'));
}

// ---- 6. A finished month is offered once, and not again after banking ----
{
  const c = clone(DEFAULT_CONFIG);
  const before = standing(c, '2026-10-03', [], [], [], []);
  assert.ok(before.waiting.some((w) => w.id === 'month'), 'September is ready');

  const banked = [{
    id: 's1', banked_on: '2026-10-01', kind: 'sweep' as const, amount: 8000,
    for_month: '2026-09', note: null, person: null, created_at: '2026-10-01T00:00:00Z',
  }];
  const after = standing(c, '2026-10-03', [], [], banked, []);
  assert.ok(!after.waiting.some((w) => w.id === 'month'), 'and not offered twice');
}

console.log('all waiting assertions passed');
