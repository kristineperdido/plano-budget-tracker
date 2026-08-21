import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, type Config } from '@/lib/config';
import { closeMonth, settle, billsDueIn, previousMonth, monthOf } from '@/lib/close';
import type { FoodEntry } from '@/lib/types';
import type { BillPayment } from '@/lib/bills';

const clone = (c: Config): Config => JSON.parse(JSON.stringify(c));

let n = 0;
function entry(p: Partial<FoodEntry>): FoodEntry {
  return {
    id: `e${n++}`,
    spent_on: '2026-09-05',
    category: 'meals',
    amount: 0,
    note: null,
    person: null,
    share: null,
    owed_amount: null,
    settled_at: null,
    from_pot: false,
    created_at: '2026-09-05T00:00:00Z',
    ...p,
  };
}
function bill(item_id: string, for_month: string, amount: number): BillPayment {
  return { id: `b${n++}`, item_id, for_month, amount, paid_on: `${for_month}-05`, note: null, person: null };
}

const TIN = 'tin@example.com';
const JHAY = 'jhay@example.com';

// ---- 1. Month helpers ----
{
  assert.equal(monthOf('2026-09-05'), '2026-09');
  assert.equal(previousMonth('2026-09'), '2026-08');
  assert.equal(previousMonth('2026-01'), '2025-12', 'January rolls back a year');
}

// ---- 2. Food underspend is the surplus when no bills are recorded ----
{
  // Tracked from the 1st, so the whole month counts.
  const c = clone(DEFAULT_CONFIG);
  c.startDate = '2026-09-01';
  const entries = [entry({ spent_on: '2026-09-05', amount: 400 })];
  const r = closeMonth(c, '2026-09', entries, [], '2026-10-03');

  assert.equal(r.foodBudget, 500 * 30, 'September has 30 days');
  assert.equal(r.foodSpent, 400);
  assert.equal(r.foodSaved, 14600);
  assert.equal(r.billsSaved, 0, 'unrecorded bills neither save nor cost');
  assert.equal(r.surplus, 14600);
  assert.ok(r.billsMissing > 0, 'and the gap is reported rather than hidden');
  assert.equal(r.complete, true, 'September is closed once it is October');
}

// ---- 2b. The move-in month is pro-rated to the day you arrive ----
{
  const c = clone(DEFAULT_CONFIG); // startDate 2026-09-15
  const r = closeMonth(c, '2026-09', [], [], '2026-10-03');
  assert.equal(r.daysCovered, 16, '15th to 30th inclusive');
  assert.equal(r.foodBudget, 8000, 'not a full 15,000 for a fortnight nobody lived here');

  // A later month is whole.
  const oct = closeMonth(c, '2026-10', [], [], '2026-11-03');
  assert.equal(oct.daysCovered, 31);
  assert.equal(oct.foodBudget, 15500);

  // And a month before the plan begins covers nothing at all.
  const aug = closeMonth(c, '2026-08', [], [], '2026-10-03');
  assert.equal(aug.daysCovered, 0);
  assert.equal(aug.foodBudget, 0);
  assert.equal(aug.surplus, 0, 'no phantom surplus before you move in');
}

// ---- 3. Entries outside the month never leak in ----
{
  const c = clone(DEFAULT_CONFIG);
  const entries = [
    entry({ spent_on: '2026-09-30', amount: 100 }),
    entry({ spent_on: '2026-10-01', amount: 9999 }),
    entry({ spent_on: '2026-08-31', amount: 9999 }),
  ];
  assert.equal(closeMonth(c, '2026-09', entries, [], '2026-10-03').foodSpent, 100);
}

// ---- 4. A bill coming in under the plan adds to the surplus ----
{
  const c = clone(DEFAULT_CONFIG);
  // Electric is planned at 2,500 from month 1, which is October.
  const r = closeMonth(c, '2026-10', [], [bill('electric', '2026-10', 1980)], '2026-11-02');

  const electric = r.bills.find((b) => b.item.id === 'electric');
  assert.ok(electric, 'electric is due in October');
  assert.equal(electric.planned, 2500);
  assert.equal(electric.actual, 1980);
  assert.equal(electric.saved, 520);
  assert.equal(r.billsSaved, 520);

  // 31 days in October, nothing spent on food.
  assert.equal(r.surplus, 500 * 31 + 520);
}

// ---- 5. A bill coming in over the plan eats into the surplus ----
{
  const c = clone(DEFAULT_CONFIG);
  const under = closeMonth(c, '2026-10', [], [bill('electric', '2026-10', 1980)], '2026-11-02');
  const over = closeMonth(c, '2026-10', [], [bill('electric', '2026-10', 3200)], '2026-11-02');
  assert.equal(over.billsSaved, -700);
  assert.equal(under.surplus - over.surplus, 1220, 'the swing is the full difference');
}

// ---- 6. Only bills the plan expects that month count ----
{
  const c = clone(DEFAULT_CONFIG);
  const sept = billsDueIn(c, '2026-09').map((i) => i.id);
  const oct = billsDueIn(c, '2026-10').map((i) => i.id);

  assert.ok(sept.includes('deposit'), 'the one-time deposit lands in month 0');
  assert.ok(!oct.includes('deposit'), 'and not again in month 1');
  assert.ok(!sept.includes('rent'), 'rent starts in month 1, the advance covers month 0');
  assert.ok(oct.includes('rent'));
  assert.ok(sept.includes('wifi'), 'monthly items from month 0 are due immediately');

  assert.equal(billsDueIn(c, '2026-08').length, 0, 'nothing is due before the plan starts');
  assert.ok(!billsDueIn(c, '2026-09').some((i) => i.pending), 'pending items are never due');
}

// ---- 7. A month still running is not complete ----
{
  const c = clone(DEFAULT_CONFIG);
  assert.equal(closeMonth(c, '2026-09', [], [], '2026-09-20').complete, false);
  assert.equal(closeMonth(c, '2026-09', [], [], '2026-10-01').complete, true);
}

// ---- 8. Settlement: an unshared entry owes nothing ----
{
  const r = settle([entry({ person: TIN, amount: 300 })]);
  assert.equal(r.creditor, null);
  assert.equal(r.amount, 0);
}

// ---- 9. A half share owes half, to whoever paid ----
{
  const r = settle([entry({ person: TIN, amount: 312, share: 'half' })]);
  assert.equal(r.creditor, TIN);
  assert.equal(r.amount, 156);
}

// ---- 10. A fixed share owes exactly that, not half ----
{
  const r = settle([entry({ person: TIN, amount: 1000, share: 'fixed', owed_amount: 250 })]);
  assert.equal(r.amount, 250);
}

// ---- 11. Opposing debts net off, and the direction follows the larger ----
{
  const r = settle([
    entry({ person: TIN, amount: 600, share: 'half' }),   // jhay owes tin 300
    entry({ person: JHAY, amount: 200, share: 'half' }),  // tin owes jhay 100
  ]);
  assert.equal(r.creditor, TIN);
  assert.equal(r.amount, 200);
}

// ---- 12. Equal and opposite debts settle to nothing ----
{
  const r = settle([
    entry({ person: TIN, amount: 500, share: 'half' }),
    entry({ person: JHAY, amount: 500, share: 'half' }),
  ]);
  assert.equal(r.creditor, null);
  assert.equal(r.amount, 0);
}

// ---- 13. An unattributed entry cannot create a debt ----
{
  const r = settle([entry({ person: null, amount: 400, share: 'half' })]);
  assert.equal(r.creditor, null, 'nobody can be owed by nobody');
}

// ---- 14. A settled entry drops out of the balance ----
{
  const open = entry({ person: TIN, amount: 600, share: 'half' });
  assert.equal(settle([open]).amount, 300);

  const squared = { ...open, settled_at: '2026-09-30T00:00:00Z' };
  assert.equal(settle([squared]).amount, 0, 'settling clears the debt');
  assert.equal(squared.amount, 600, 'but the spend itself is untouched');
}

console.log('all close/settlement assertions passed');
