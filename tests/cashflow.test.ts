import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, type Config } from '@/lib/config';
import { computeCashflow } from '@/lib/cashflow';
import { computePlan } from '@/lib/engine';

const clone = (c: Config): Config => JSON.parse(JSON.stringify(c));
const round = (x: number) => Math.round(x);

// ---- 1. The real plan, laid out month by month ----
{
  const f = computeCashflow(DEFAULT_CONFIG);
  assert.equal(f.months.length, 5, 'five months, matching jhay\u2019s cutoff sheet');
  assert.equal(f.months[0].month, '2026-09');
  assert.equal(f.months[4].month, '2027-01');

  // Every month runs a deficit: one income, two people, and the move-in costs
  // all land in the first.
  for (const m of f.months) assert.ok(m.gap < 0, `${m.month} cannot pay for itself`);
  assert.ok(f.months[0].out > f.months[1].out, 'the move-in month is the heaviest');

  // Reserves are separated by how much they can be relied on.
  assert.equal(f.reserves.committed, 40000, 'her savings are the only money in hand');
  assert.equal(f.reserves.uncertain, 10000, "the brother's repayment is a maybe");
  assert.equal(f.reserves.backup, 10819, 'his savings are held back');
}

// ---- 2. How far the money actually goes ----
//
// The point of the five-month phase: it answers the runway question. Committed
// money carries two months, then it leans on the repayment, then on the savings
// that were meant to stay untouched.
{
  const f = computeCashflow(DEFAULT_CONFIG);

  assert.equal(f.firstMonthShort, null, 'nothing is uncovered inside the window');
  assert.equal(f.monthsCovered, 5);
  assert.equal(f.lastsUntil, '2027-01');

  assert.equal(f.firstMonthNeedingUncertain, '2026-11', 'money in hand runs out in November');

  const jan = f.months[4];
  assert.ok(jan.needsBackup, 'January is being paid out of the backup savings');
  const leftAtEnd = jan.committedLeft + jan.uncertainLeft + jan.backupLeft;
  assert.ok(leftAtEnd > 0 && leftAtEnd < 3000, `only ${Math.round(leftAtEnd)} left by the end`);

  console.log(
    `  five months: committed runs out ${f.firstMonthNeedingUncertain}, ` +
      `${Math.round(leftAtEnd)} left at the end`,
  );
}

// ---- 2a. The plan ending is not the same as the money lasting ----
//
// All five months are covered, so nothing inside the window looks wrong. But
// the plan simply stops in January with 2,261 against a shortfall of about
// 8,395 a month — roughly a week. Reporting "lasts until January" without this
// would read as a runway rather than as where the plan happens to end.
{
  const f = computeCashflow(DEFAULT_CONFIG);
  assert.equal(f.firstMonthShort, null, 'nothing runs short inside the plan');
  assert.equal(f.monthsBeyond, 0, 'not even one further month is covered');
  assert.equal(f.projectedDry, '2027-02');

  // Running the same conditions longer confirms it independently.
  const c = clone(DEFAULT_CONFIG);
  c.phases[1].months = 10;
  assert.equal(computeCashflow(c).firstMonthShort, '2027-02', 'the same month, the long way round');

  console.log(`  plan ends 2027-01; on the same rate the money gives out ${f.projectedDry}`);
}

// ---- 2b. Losing the uncertain money shortens the runway ----
{
  const c = clone(DEFAULT_CONFIG);
  c.moneyIn = c.moneyIn.filter((m) => !m.uncertain);
  const f = computeCashflow(c);
  assert.ok(
    f.firstMonthShort !== null,
    'without the repayment the plan does not reach the end of the window',
  );
  console.log(`  without the repayment it runs dry in ${f.firstMonthShort}`);
}

// ---- 2d. The toggles actually move the cashflow ----
//
// They used to move nothing: computeCashflow ignored them entirely, so the
// controls on Plan were inert.
{
  const all = { includeUncertain: true, includePending: false, useBackup: true };

  const withUncertain = computeCashflow(DEFAULT_CONFIG, all);
  const without = computeCashflow(DEFAULT_CONFIG, { ...all, includeUncertain: false });
  assert.equal(withUncertain.reserves.uncertain, 10000);
  assert.equal(without.reserves.uncertain, 0, 'the repayment stops counting');
  assert.notEqual(without.firstMonthShort, withUncertain.firstMonthShort, 'and the runway shortens');

  // Pending costs are charged only when asked for.
  const withPending = computeCashflow(DEFAULT_CONFIG, { ...all, includePending: true });
  assert.ok(
    withPending.totalGap > withUncertain.totalGap,
    'the unpriced costs make the shortfall bigger',
  );

  // Refusing to touch the reserve is a different question, with a shorter answer.
  const noBackup = computeCashflow(DEFAULT_CONFIG, { ...all, useBackup: false });
  assert.equal(noBackup.reserves.backup, 0);
  assert.ok(
    noBackup.monthsCovered < withUncertain.monthsCovered,
    'without the reserve it does not reach the end',
  );
  console.log(
    `  reserve untouched: covers ${noBackup.monthsCovered} months, short from ${noBackup.firstMonthShort}`,
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
