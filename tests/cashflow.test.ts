import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, type Config } from '@/lib/config';
import { computeCashflow, type CashflowOptions } from '@/lib/cashflow';
import { computePlan } from '@/lib/engine';

const clone = (c: Config): Config => JSON.parse(JSON.stringify(c));
const round = (x: number) => Math.round(x);

// ---- 1. The real plan, laid out month by month ----
{
  const f = computeCashflow(DEFAULT_CONFIG);
  assert.equal(f.months.length, 5, 'five months, matching jhay\u2019s cutoff sheet');
  assert.equal(f.months[0].month, '2026-09');
  assert.equal(f.months[4].month, '2027-01');

  // September is heaviest because the move-in lands in it — but it is not a
  // shortfall, because tin's savings were put aside for exactly those costs.
  assert.ok(f.months[0].out > f.months[1].out, 'the move-in month is the heaviest');
  assert.ok(f.months[0].gap > 0, 'and with the move-in paid for, income covers the rest');
  for (const m of f.months.slice(1)) {
    assert.ok(m.gap < 0, `${m.month} cannot pay for itself`);
  }

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

// ---- 1b. Money put aside for a cost pays it, and is not a shortfall ----
{
  const f = computeCashflow(DEFAULT_CONFIG);
  const sep = f.months[0];

  assert.equal(round(sep.paidFromEarmark), 39083, 'the whole move-in comes from the pot');
  assert.equal(sep.fromEarmark[0].potLabel, 'Her savings');

  const hers = f.pots.find((p) => p.id === 'her-savings')!;
  assert.equal(round(hers.spentOnEarmark), 39083);
  assert.equal(round(hers.spentGenerally), 917, 'the remainder is spendable like anything else');

  // Nothing is created or destroyed: what every pot holds, less what was spent,
  // is what is left.
  const spent = f.pots.reduce((a, p) => a + p.spentOnEarmark + p.spentGenerally, 0);
  const held = f.pots.reduce((a, p) => a + p.amount, 0);
  assert.equal(round(held - spent), round(f.reservesLeft));

  // The same identity has to hold on a plan that earns a surplus, which is
  // where it previously broke: money kept from a good month was being counted
  // as though it were savings that had never been spent.
  const earning = clone(DEFAULT_CONFIG);
  earning.phases.push({
    id: 'rich', label: 'Both earning', from: '2027-02', months: 3,
    schemeId: 'standard', foodPayer: 'split',
    income: [
      { id: 'him', label: "Jhay's pay", owner: 'him', amount: 27000 },
      { id: 'her', label: "Tin's pay", owner: 'her', amount: 27000 },
    ],
  });
  const e = computeCashflow(earning);
  const eSpent = e.pots.reduce((a, p) => a + p.spentOnEarmark + p.spentGenerally, 0);
  const eHeld = e.pots.reduce((a, p) => a + p.amount, 0);
  assert.equal(round(eHeld - eSpent), round(e.reservesLeft), 'savings left is savings only');
  assert.ok(e.inHandAtEnd > e.reservesLeft, 'and what you hold includes what you earned');
  assert.ok(
    e.reservesLeft <= eHeld,
    'you cannot end with more savings than you ever had',
  );

  // Without the earmark the same month reads as a 25,478 shortfall.
  const bare = clone(DEFAULT_CONFIG);
  bare.moneyIn = bare.moneyIn.map((m) => ({ ...m, earmark: undefined }));
  const g = computeCashflow(bare);
  assert.equal(round(g.months[0].gap), -25478);
  assert.equal(round(g.reservesLeft), round(f.reservesLeft), 'and ends in the same place either way');
}

// ---- 1c. An earmark says what money is for, not what it is limited to ----
{
  const c = clone(DEFAULT_CONFIG);
  // A pot far too small for what it is pointed at.
  c.moneyIn = [
    { id: 'small', label: 'A little put by', amount: 5000, owner: 'her', earmark: ['deposit'] },
    { id: 'rest', label: 'The rest', amount: 60000, owner: 'her' },
  ];
  const f = computeCashflow(c);
  const small = f.pots.find((p) => p.id === 'small')!;

  assert.equal(round(small.spentOnEarmark), 5000, 'it gives what it has');
  assert.equal(round(small.remaining), 0);
  assert.equal(f.firstMonthShort, null, 'and the rest is covered from elsewhere');
  assert.ok(f.pots.find((p) => p.id === 'rest')!.spentGenerally > 0);
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

  // Pending costs are charged only when asked for. Measured on outgoings and on
  // what survives, not on totalGap: the unpriced costs land in September, which
  // now runs a surplus, so they eat into that before they make any gap wider.
  const withPending = computeCashflow(DEFAULT_CONFIG, { ...all, includePending: true });
  const outOf = (f: typeof withPending) => f.months.reduce((a, m) => a + m.out, 0);
  assert.ok(outOf(withPending) > outOf(withUncertain), 'the unpriced costs are charged');
  assert.ok(
    withPending.reservesLeft < withUncertain.reservesLeft,
    'and less money survives the plan',
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
    { id: 'lean', label: 'Lean', from: '2026-09', months: 2, income: [], schemeId: 'standard', foodPayer: 'split' },
    { id: 'flush', label: 'Flush', from: '2026-11', months: 1, income: [{ id: 'her', label: "Tin's pay", owner: 'her' as const, amount: 200000 }, ], schemeId: 'standard', foodPayer: 'split' },
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
  c.schemes[0].items = [];               // no costs at all
  c.moneyIn = [];             // no reserves
  c.phases = [{ id: 'p', label: 'P', from: '2026-09', months: 2, income: [{ id: 'her', label: "Tin's pay", owner: 'her' as const, amount: 50000 }, ], schemeId: 'standard', foodPayer: 'split' }];
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
  c.pending.push({
    id: 'guess', label: 'A guess', amount: 99999, cadence: 'onetime',
    startMonth: 0, payer: 'split', group: 'movein', pending: true,
  });
  assert.equal(computeCashflow(c).months[0].out, before, 'an unpriced cost is not folded in');

  // And a stray pending line inside a scheme is still not charged: which list
  // it is in decides, but the flag is honoured too rather than silently ignored.
  const stray = clone(DEFAULT_CONFIG);
  stray.schemes[0].items.push({
    id: 'stray', label: 'Stray', amount: 99999, cadence: 'onetime',
    startMonth: 0, payer: 'split', group: 'movein', pending: true,
  });
  assert.equal(computeCashflow(stray).months[0].out, before, 'the flag still bites');
}

// ---- 6b. Each month itemises to exactly its own total ----
{
  const f = computeCashflow(DEFAULT_CONFIG);
  for (const m of f.months) {
    const out = m.costLines.reduce((a, l) => a + l.amount, 0);
    assert.equal(round(out), round(m.out), `${m.month} costs add up to its total`);
    const inn = m.incomeLines.reduce((a, l) => a + l.amount, 0);
    assert.equal(round(inn), round(m.income), `${m.month} income adds up to its total`);
  }

  // September carries the move-in, so it has the most lines and the largest one.
  const sep = f.months[0];
  assert.ok(sep.costLines.length > f.months[1].costLines.length);
  assert.equal(sep.costLines[0].label, 'Security deposit', 'heaviest line first');
  assert.equal(sep.costLines[sep.costLines.length - 1].label, 'Food (16 days)');

  // A line the scheme drops stops appearing in the months that scheme covers.
  const c = clone(DEFAULT_CONFIG);
  c.schemes.push({
    id: 'no-mama',
    label: 'Without the allowance',
    items: c.schemes[0].items.filter((i) => i.id !== 'mama'),
  });
  c.phases[1].schemeId = 'no-mama';
  const g = computeCashflow(c);
  assert.ok(g.months[0].costLines.some((l) => l.id === 'mama'), 'charged under the first scheme');
  assert.ok(!g.months[4].costLines.some((l) => l.id === 'mama'), 'gone under the second');
}

// ---- 7. Food is charged on the days actually lived there ----
{
  const f = computeCashflow(DEFAULT_CONFIG); // move-in 15 September
  assert.equal(f.months[0].food, 500 * 16, 'September, from the 15th');
  assert.equal(f.months[1].food, 500 * 31, 'October in full');
}


// ---- 9. What survives is explained month by month ----
{
  const c = clone(DEFAULT_CONFIG);
  c.phases.push({
    id: 'rich', label: 'Both earning', from: '2027-02', months: 3,
    schemeId: 'standard', foodPayer: 'split',
    income: [
      { id: 'him', label: "Jhay's pay", owner: 'him', amount: 27000 },
      { id: 'her', label: "Tin's pay", owner: 'her', amount: 27000 },
    ],
  });
  const f = computeCashflow(c);

  const kept = f.months.reduce((a, m) => a + m.keptForLater, 0);
  const eaten = f.months.reduce((a, m) => a + m.fromCarried, 0);

  assert.ok(kept > 0, 'the earning months put something by');
  assert.equal(
    round(kept - eaten),
    round(f.inHandAtEnd - f.reservesLeft),
    'and what survives is exactly what was kept less what later months ate',
  );

  // Every month either keeps or eats, never both.
  for (const m of f.months) {
    assert.ok(m.keptForLater === 0 || m.fromCarried === 0, `${m.month} does not do both`);
  }
}


// ---- 10. When the savings run out is not when the plan runs short ----
{
  const c = clone(DEFAULT_CONFIG);
  c.phases.push({
    id: 'rich', label: 'Both earning', from: '2027-02', months: 3,
    schemeId: 'standard', foodPayer: 'split',
    income: [
      { id: 'him', label: "Jhay's pay", owner: 'him', amount: 27000 },
      { id: 'her', label: "Tin's pay", owner: 'her', amount: 27000 },
    ],
  });
  const f = computeCashflow(c, { includeUncertain: false, includePending: false, useBackup: true });

  assert.equal(round(f.reservesLeft), 0, 'every peso of savings goes');
  assert.ok(f.savingsGoneIn !== null, 'and there is a month it happens in');

  // The month named is the first one that ends with nothing left.
  const named = f.months.find((m) => m.month === f.savingsGoneIn)!;
  assert.ok(named.reservesAfter <= 0.005);
  const before = f.months[f.months.indexOf(named) - 1];
  if (before) assert.ok(before.reservesAfter > 0, 'and the month before still had some');

  // Savings surviving means no month is named at all.
  const comfortable = clone(c);
  comfortable.phases[0].income[0].amount = 60000;
  comfortable.phases[1].income[0].amount = 60000;
  const g = computeCashflow(comfortable, { includeUncertain: false, includePending: false, useBackup: true });
  assert.ok(g.reservesLeft > 0);
  assert.equal(g.savingsGoneIn, null);
}


// ---- 11. Every figure the card names is a row the card shows ----
// The reserves footer prints committed/uncertain/backup, sums them as "Savings
// in play", and the closing line quotes that sum. A pot hidden by a toggle must
// therefore leave the total too, or the sentence cites a number nobody can see.
{
  const c = clone(DEFAULT_CONFIG);
  c.moneyIn = [
    { id: 'a', label: 'Savings', amount: 40000, owner: 'her' },
    { id: 'b', label: 'Maybe bonus', amount: 9000, owner: 'him', uncertain: true },
    { id: 'c', label: 'Emergency', amount: 10819, owner: 'her', backup: true },
  ];

  const shown = (o: CashflowOptions) => {
    const f = computeCashflow(c, o);
    // Mirrors the component: committed always, the others only when non-zero.
    return (
      f.reserves.committed +
      (f.reserves.uncertain > 0 ? f.reserves.uncertain : 0) +
      (f.reserves.backup > 0 ? f.reserves.backup : 0)
    );
  };
  const total = (o: CashflowOptions) => {
    const f = computeCashflow(c, o);
    return f.reserves.committed + f.reserves.uncertain + f.reserves.backup;
  };

  for (const includeUncertain of [true, false]) {
    for (const useBackup of [true, false]) {
      const o = { includeUncertain, useBackup, includePending: false };
      assert.equal(round(total(o)), round(shown(o)), `sum matches rows @ ${includeUncertain}/${useBackup}`);
      // And it never exceeds the money that actually exists.
      assert.ok(total(o) <= 59819.005);
    }
  }

  // Concretely: with both toggles off only the committed pot is left.
  assert.equal(round(total({ includeUncertain: false, useBackup: false, includePending: false })), 40000);
  assert.equal(round(total({ includeUncertain: true, useBackup: true, includePending: false })), 59819);
}


// ---- 12. The ending is signed, and never floored at zero ----
// A plan that overruns its savings and one that never touches them are
// different outcomes; both used to print "0". savingsEnd separates them.
{
  const c = clone(DEFAULT_CONFIG);
  c.moneyIn = [{ id: 'a', label: 'Savings', amount: 40000, owner: 'her' }];
  const o = { includeUncertain: false, includePending: false, useBackup: true };

  // Overrun: savings gone AND months left uncovered.
  const lean = computeCashflow(c, o);
  if (lean.totalShort > 0) {
    assert.equal(round(lean.reservesLeft), 0, 'pots are emptied before a month is short');
    assert.ok(lean.savingsEnd < 0, 'and the ending goes negative rather than to zero');
    assert.equal(round(lean.savingsEnd), -round(lean.totalShort));
  }

  // Surplus: savings survive, nothing uncovered.
  const rich = clone(c);
  rich.phases.forEach((p) => p.income.forEach((s) => (s.amount = 90000)));
  const g = computeCashflow(rich, o);
  assert.equal(round(g.totalShort), 0, 'nothing is short when income covers it');
  assert.ok(g.savingsEnd > 0, 'and the ending is the untouched savings');
  assert.equal(round(g.savingsEnd), round(g.reservesLeft));

  // The two can never both be non-zero: reserves are spent before short is called.
  for (const inc of [0, 15000, 27900, 45000, 60000, 90000]) {
    const t = clone(c);
    t.phases.forEach((p) => p.income.forEach((s) => (s.amount = inc)));
    const f = computeCashflow(t, o);
    assert.ok(
      f.reservesLeft <= 0.005 || f.totalShort <= 0.005,
      `income ${inc}: cannot have savings left and be short at once`,
    );
    assert.equal(round(f.savingsEnd), round(f.reservesLeft - f.totalShort));
  }

  // Per-month amounts add up to the total.
  const sum = lean.months.reduce((s, m) => s + m.shortBy, 0);
  assert.equal(round(sum), round(lean.totalShort), 'months account for the whole shortfall');
  lean.months.forEach((m) => {
    assert.equal(m.short, m.shortBy > 0.005, 'the flag and the amount agree');
  });
}

console.log('all cashflow assertions passed');
