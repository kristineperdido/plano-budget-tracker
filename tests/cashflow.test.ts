import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, type Config } from '@/lib/config';
import { computeCashflow } from '@/lib/cashflow';
import { computePlan } from '@/lib/engine';

const clone = (c: Config): Config => JSON.parse(JSON.stringify(c));
const round = (x: number) => Math.round(x);

// ---- 1. The real plan, laid out month by month ----
{
  const f = computeCashflow(DEFAULT_CONFIG);
  assert.equal(f.months.length, 2);

  const [sep, oct] = f.months;
  assert.equal(sep.month, '2026-09');
  assert.equal(oct.month, '2026-10');

  // September carries every move-in cost, so it cannot pay for itself.
  assert.ok(sep.gap < 0, 'the move-in month runs a deficit');
  assert.ok(oct.gap < 0, 'and so does the month after, while she is not earning');

  // Reserves are separated by how much they can be relied on.
  assert.equal(f.reserves.committed, 40000, "her savings are the only money in hand");
  assert.equal(f.reserves.uncertain, 10000, "the brother's repayment is a maybe");
  assert.equal(f.reserves.backup, 10819, 'his savings are held back');
}

// ---- 2. Committed money alone carries this plan ----
//
// Worth recording how this changed. On the old food basis - the forecast rate,
// charged for a whole September nobody lived through - the two months needed
// 41,002 against 40,000 of committed money, so the plan only balanced because
// the brother's promised 10,000 was being counted as cash. Charging food at the
// allowance for the days actually lived there took 7,529 off, and it now clears
// on money in hand.
{
  const f = computeCashflow(DEFAULT_CONFIG);

  assert.equal(round(f.totalGap), 33473, 'the two months need this much beyond income');
  assert.ok(f.totalGap < f.reserves.committed, 'and committed money covers it');
  assert.equal(f.firstMonthNeedingUncertain, null, "the brother's money is not load-bearing");
  assert.equal(f.firstMonthShort, null);
  assert.equal(round(f.endsWith), 6527, 'what is left in hand at the end');

  // Untouched reserves stay untouched.
  const last = f.months[f.months.length - 1];
  assert.equal(last.uncertainLeft, 10000);
  assert.equal(last.backupLeft, 10819);

  console.log(`  clears on committed money, ending with ${round(f.endsWith)} in hand`);
}

// ---- 2b. Losing the uncertain money changes nothing here ----
{
  const c = clone(DEFAULT_CONFIG);
  const withIt = computeCashflow(c).endsWith;
  c.moneyIn = c.moneyIn.filter((m) => !m.uncertain);
  assert.equal(round(computeCashflow(c).endsWith), round(withIt), 'it was never being spent');
}

// ---- 2c. But it does bite if the gap is wider ----
{
  const c = clone(DEFAULT_CONFIG);
  c.phases[0].income.him = 20000; // 7,400 a month less
  const f = computeCashflow(c);
  assert.ok(f.firstMonthNeedingUncertain !== null, 'now the promised money is load-bearing');
  console.log(
    `  on 20,000 a month it leans on uncertain money from ${f.firstMonthNeedingUncertain}`,
  );
}

// ---- 3. Reserves are drawn down in confidence order ----
{
  const c = clone(DEFAULT_CONFIG);
  const f = computeCashflow(c);

  // Committed is spent before uncertain, and uncertain before backup.
  for (const m of f.months) {
    if (m.needsUncertain) assert.equal(round(m.committedLeft), 0, 'committed is exhausted first');
    if (m.needsBackup) assert.equal(round(m.uncertainLeft), 0, 'uncertain is exhausted next');
  }
  // Backup is never touched while anything else remains.
  const touchedBackup = f.months.find((m) => m.needsBackup);
  if (touchedBackup) assert.equal(round(touchedBackup.uncertainLeft), 0);
}

// ---- 4. A plan that balances overall can still run dry early ----
{
  const c = clone(DEFAULT_CONFIG);
  // All the money arrives, but only at the very end.
  c.phases = [
    { id: 'lean', label: 'Lean', months: 2, income: { her: 0, him: 0, herSideHustle: 0 }, payers: {}, foodPayer: 'split' },
    { id: 'flush', label: 'Flush', months: 1, income: { her: 200000, him: 0, herSideHustle: 0 }, payers: {}, foodPayer: 'split' },
  ];
  const plan = computePlan(c, { includeUncertain: true, includePending: false });
  const f = computeCashflow(c);

  assert.ok(plan.combined > 0, 'overall it comes out well ahead');
  assert.ok(f.firstMonthShort !== null, 'but there is a month nothing can pay for');
  // September is survivable on reserves; October is where they run out, two
  // months before the money arrives.
  assert.equal(f.firstMonthShort, '2026-10');
  assert.equal(f.months[0].short, false);
  assert.equal(f.months[1].short, true);
}

// ---- 5. Surplus in one month carries into the next ----
{
  const c = clone(DEFAULT_CONFIG);
  c.items = [];               // no costs at all
  c.moneyIn = [];             // no reserves
  c.phases = [{ id: 'p', label: 'P', months: 2, income: { her: 50000, him: 0, herSideHustle: 0 }, payers: {}, foodPayer: 'split' }];
  const f = computeCashflow(c);

  assert.ok(f.months[0].gap > 0);
  assert.equal(
    round(f.months[1].committedLeft),
    round(f.months[0].gap + f.months[1].gap),
    'what is left over is still there the following month',
  );
  assert.equal(f.firstMonthShort, null, 'and nothing is ever short');
}

// ---- 6. Pending items stay out of the cashflow ----
{
  const c = clone(DEFAULT_CONFIG);
  const before = computeCashflow(c).months[0].out;
  c.items.push({
    id: 'guess', label: 'A guess', amount: 99999, cadence: 'onetime',
    startMonth: 0, payer: 'split', group: 'movein', pending: true,
  });
  assert.equal(computeCashflow(c).months[0].out, before, 'an unpriced cost is not folded in');
}

// ---- 7. Food is charged on the days actually lived there ----
{
  const f = computeCashflow(DEFAULT_CONFIG); // move-in 15 September
  assert.equal(f.months[0].food, 500 * 16, 'September, from the 15th');
  assert.equal(f.months[1].food, 500 * 31, 'October in full');
}

console.log('all cashflow assertions passed');
