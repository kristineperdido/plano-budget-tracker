import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, schemeFor, schemesWith, type Config } from '@/lib/config';
import { computePlan, phaseOf } from '@/lib/engine';
import { computeCashflow } from '@/lib/cashflow';
import { billsDueIn } from '@/lib/close';

const clone = (c: Config): Config => JSON.parse(JSON.stringify(c));
const round = (x: number) => Math.round(x);
const OPTS = { includeUncertain: true, includePending: false };

// ---- 1. The seeded plan has one scheme, and every phase uses it ----
{
  const c = DEFAULT_CONFIG;
  assert.equal(c.schemes.length, 1);
  assert.equal(c.pending.length, 2, 'unpriced costs live outside the schemes');
  for (const p of c.phases) assert.equal(p.schemeId, c.schemes[0].id);
  assert.ok(!c.schemes[0].items.some((i) => i.pending), 'no pending line inside a scheme');
}

// ---- 2. A second scheme changes only the phase that uses it ----
{
  const c = clone(DEFAULT_CONFIG);
  const before = computePlan(c, OPTS);

  // Same lines, same ids — rent split evenly instead of falling on jhay.
  c.schemes.push({
    id: 'even',
    label: 'Split evenly',
    items: c.schemes[0].items.map((i) => (i.id === 'rent' ? { ...i, payer: 'split' } : i)),
  });
  c.phases[1].schemeId = 'even';
  const after = computePlan(c, OPTS);

  // The household pays the same rent either way.
  const rentBefore = before.items.find((b) => b.item.id === 'rent')!;
  const rentAfter = after.items.find((b) => b.item.id === 'rent')!;
  assert.equal(rentBefore.total, rentAfter.total, 'the rent itself does not change');
  assert.equal(round(before.combined), round(after.combined), 'nor does the combined net');

  // But it lands differently: three of the four rent months move to 50/50.
  assert.ok(rentAfter.split.her > rentBefore.split.her, 'tin now carries some rent');
  assert.equal(
    round(rentAfter.split.her + rentAfter.split.him),
    round(rentBefore.split.her + rentBefore.split.him),
  );
}

// ---- 3. A line absent from a scheme is not charged while that scheme runs ----
// This is how a cost stops partway through the plan, which nothing else allowed.
{
  const c = clone(DEFAULT_CONFIG);
  const withIt = computePlan(c, OPTS);

  c.schemes.push({
    id: 'no-mama',
    label: 'Without the allowance',
    items: c.schemes[0].items.filter((i) => i.id !== 'mama'),
  });
  c.phases[1].schemeId = 'no-mama';
  const without = computePlan(c, OPTS);

  const mamaBefore = withIt.items.find((b) => b.item.id === 'mama')!;
  const mamaAfter = without.items.find((b) => b.item.id === 'mama')!;
  assert.equal(mamaBefore.occurrences, 5, 'charged every month of the plan');
  assert.equal(mamaAfter.occurrences, 2, 'only while the first scheme is in force');
  assert.equal(round(withIt.combined - without.combined), -2500 * 3);
}

// ---- 4. Ids are what carry across schemes, so recorded figures still resolve ----
{
  const c = clone(DEFAULT_CONFIG);
  c.schemes.push({
    id: 'even',
    label: 'Split evenly',
    items: c.schemes[0].items.map((i) => ({ ...i })),
  });
  c.phases[1].schemeId = 'even';

  assert.equal(schemesWith(c, 'rent').length, 2, 'rent exists in both');
  assert.equal(schemeFor(c, c.phases[0]).id, 'standard');
  assert.equal(schemeFor(c, c.phases[1]).id, 'even');

  // The month close asks about the same line id whichever scheme is in force.
  assert.ok(billsDueIn(c, '2026-10').some((i) => i.id === 'rent'));
  assert.ok(billsDueIn(c, '2026-12').some((i) => i.id === 'rent'));
}

// ---- 5. billsDueIn follows the scheme, not a global list ----
{
  const c = clone(DEFAULT_CONFIG);
  c.schemes.push({
    id: 'lean',
    label: 'Lean',
    items: c.schemes[0].items.filter((i) => i.id !== 'laundry'),
  });
  c.phases[1].schemeId = 'lean';

  assert.ok(billsDueIn(c, '2026-10').some((i) => i.id === 'laundry'), 'due under the first scheme');
  assert.ok(
    !billsDueIn(c, '2026-12').some((i) => i.id === 'laundry'),
    'not asked about once the scheme drops it',
  );
}

// ---- 6. The cashflow reads the scheme in force each month ----
{
  const c = clone(DEFAULT_CONFIG);
  const before = computeCashflow(c);
  c.schemes.push({
    id: 'cheap',
    label: 'Cheaper rent',
    items: c.schemes[0].items.map((i) => (i.id === 'rent' ? { ...i, amount: 5000 } : i)),
  });
  c.phases[1].schemeId = 'cheap';
  const after = computeCashflow(c);

  const sept = (f: typeof before) => f.months.find((m) => m.month === '2026-09')!;
  const dec = (f: typeof before) => f.months.find((m) => m.month === '2026-12')!;

  assert.equal(round(sept(before).out), round(sept(after).out), 'the first phase is untouched');
  assert.equal(
    round(dec(before).out - dec(after).out),
    5000,
    'and the second phase pays the cheaper rent',
  );
}

// ---- 7. A phase pointing at a scheme that no longer exists still resolves ----
{
  const c = clone(DEFAULT_CONFIG);
  c.phases[0].schemeId = 'deleted';
  assert.equal(schemeFor(c, c.phases[0]).id, 'standard', 'falls back rather than throwing');
  assert.ok(computePlan(c, OPTS).combined !== 0);
  assert.equal(phaseOf(c.phases, 0, c.startMonth)?.id, 'gap');
}

console.log('all scheme assertions passed');
