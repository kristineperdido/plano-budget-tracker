import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, migrateFood, type Config, type LegacyFoodConfig } from '@/lib/config';
import { computePlan, foodForecast, applyPayer, phaseOf, totalMonths } from '@/lib/engine';
import { phaseSpans } from '@/lib/phase';

const clone = (c: Config): Config => JSON.parse(JSON.stringify(c));

// ---- 1. The plan's output ----
//
// The sample plan runs five months. Its figures are illustrative, but the
// relationships between them are the ones the engine has to get right: one
// earner, shared living costs, a pot of savings pointed at the move-in, and a
// second income arriving partway through.
{
  const r = computePlan(DEFAULT_CONFIG, { includeUncertain: true, includePending: false });
  console.log('herNet   ', Math.round(r.net.her));
  console.log('himNet   ', Math.round(r.net.him));
  console.log('combined ', Math.round(r.combined));
  assert.equal(r.months, 5);
  assert.equal(Math.round(r.net.her), -26675);
  assert.equal(Math.round(r.net.him), 18325);
  assert.equal(Math.round(r.combined), -8350);
  assert.equal(r.backup.him, 9500);

  // Food is charged at the allowance for the days actually lived there:
  // 16 of September from the 15th, then whole months.
  assert.equal(r.food.total, 500 * (16 + 31 + 30 + 31 + 31));

  // The forecast still runs above the allowance, and says so rather than being
  // quietly priced in.
  assert.equal(Math.round(r.foodVariance.gap), 86);
}

// ---- 2. Toggles actually move the model ----
{
  const withU = computePlan(DEFAULT_CONFIG, { includeUncertain: true, includePending: false });
  const noU = computePlan(DEFAULT_CONFIG, { includeUncertain: false, includePending: false });
  assert.equal(Math.round(withU.net.her - noU.net.her), 8000, 'the uncertain money is worth exactly its face value to her');
  assert.equal(withU.net.him, noU.net.him, 'uncertain money is hers, not his');

  const withP = computePlan(DEFAULT_CONFIG, { includeUncertain: true, includePending: true });
  // appliances 4000 split; termination fee is 0 until they learn it
  assert.equal(Math.round(withU.net.her - withP.net.her), 2000);
  assert.equal(Math.round(withU.net.him - withP.net.him), 2000);
}

// ---- 2b. An item scheduled outside the plan is reported, not silently dropped ----
{
  const c = clone(DEFAULT_CONFIG);
  const before = computePlan(c, { includeUncertain: true, includePending: false });
  assert.equal(before.orphaned.length, 0, 'nothing is stranded to begin with');

  c.schemes[0].items.push({
    id: 'car', label: 'Car payment', amount: 9999, cadence: 'monthly',
    startMonth: 5, payer: 'split', group: 'living',
  });
  const after = computePlan(c, { includeUncertain: true, includePending: false });
  assert.equal(Math.round(after.combined), Math.round(before.combined), 'it is genuinely not charged');
  assert.equal(after.orphaned.length, 1, 'but it is reported rather than vanishing');
  assert.equal(after.orphaned[0].id, 'car');
}

// ---- 2c. A window narrows the calculation to one stretch of months ----
{
  const c = clone(DEFAULT_CONFIG);
  c.phases = [
    { id: 'a', label: 'A', from: '2026-09', months: 1, income: [{ id: 'him', label: "Jhay's pay", owner: 'him' as const, amount: 27400 }, ], schemeId: 'standard', foodPayer: 'split' },
    { id: 'b', label: 'B', from: '2026-10', months: 1, income: [{ id: 'him', label: "Jhay's pay", owner: 'him' as const, amount: 27400 }, { id: 'her', label: "Tin's pay", owner: 'her' as const, amount: 30000 }, ], schemeId: 'standard', foodPayer: 'split' },
  ];

  const whole = computePlan(c, { includeUncertain: true, includePending: false });
  const first = computePlan(c, { includeUncertain: true, includePending: false, window: { from: 0, to: 0 } });
  const second = computePlan(c, { includeUncertain: true, includePending: false, window: { from: 1, to: 1 } });

  assert.equal(first.months, 1);
  assert.equal(second.months, 1);

  // Costs are additive across the slices.
  assert.equal(
    Math.round(first.costs.her + second.costs.her),
    Math.round(whole.costs.her),
    'the phases account for every peso of cost',
  );
  assert.equal(Math.round(first.income.him + second.income.him), Math.round(whole.income.him));

  // Money-in belongs to the plan, not to a phase; crediting it to each would
  // count the same savings twice.
  assert.equal(first.moneyIn.her, 0, 'a slice does not claim the savings');
  assert.equal(second.moneyIn.her, 0);
  assert.equal(whole.moneyIn.her, 35000 + 8000);

  // The second phase is the one where she starts earning.
  assert.equal(first.income.her, 0);
  assert.equal(second.income.her, 30000);
}

// ---- 3. Payer semantics ----
assert.deepEqual(applyPayer(500, 'each'), { her: 500, him: 500 }, "'each' is per-person, not halved");
assert.deepEqual(applyPayer(3000, 'split'), { her: 1500, him: 1500 });
assert.deepEqual(applyPayer(100, 'her'), { her: 100, him: 0 });

// ---- 4. Cadence and startMonth ----
{
  const r = computePlan(DEFAULT_CONFIG, { includeUncertain: true, includePending: false });
  const by = (id: string) => r.items.find((b) => b.item.id === id)!;
  // Five months mapped: rent from month 1 is four of them, wifi from month 0 all five.
  assert.equal(by('rent').occurrences, 4, 'rent starts month 1');
  assert.equal(by('wifi').occurrences, 5, 'wifi runs from month 0');
  assert.equal(by('deposit').occurrences, 1, 'one-time lands once');
  assert.equal(by('deposit').split.him, 0, 'she pays the deposit alone');
  assert.equal(by('keycard').split.her, 500);
  assert.equal(by('keycard').split.him, 500);
}

// ---- 5. Multi-phase: a second phase changes incomes and who pays ----
{
  // Phases are set outright rather than appended, so this stays a two-phase
  // scenario however many phases the real plan grows to. Who pays now comes
  // from the scheme the phase follows, not from per-phase overrides.
  const c = clone(DEFAULT_CONFIG);
  c.schemes.push({
    id: 'even',
    label: 'Split evenly',
    items: c.schemes[0].items.map((i) =>
      i.id === 'rent' || i.id === 'electric' ? { ...i, payer: 'split' as const } : i,
    ),
  });
  c.phases = [
    {
      id: 'gap',
      from: '2026-09',
      label: 'Between jobs',
      months: 2,
      income: [{ id: 'him', label: 'His pay', owner: 'him' as const, amount: 25000 }, ],
      schemeId: 'standard',
      foodPayer: 'split',
    },
    {
      id: 'employed',
      from: '2026-11',
      label: 'She is working',
      months: 2,
      income: [{ id: 'him', label: 'His pay', owner: 'him' as const, amount: 25000 }, { id: 'her', label: 'Her pay', owner: 'her' as const, amount: 20000 }, ],
      schemeId: 'even',
      foodPayer: 'split',
    },
  ];
  const r = computePlan(c, { includeUncertain: true, includePending: false });
  assert.equal(r.months, 4);

  // Rent is active months 1..3. Month 1 is his (phase 1); months 2-3 split.
  const rent = r.items.find((b) => b.item.id === 'rent')!;
  assert.equal(rent.occurrences, 3);
  assert.equal(rent.split.him, 10000 + 10000 / 2 + 10000 / 2);
  assert.equal(rent.split.her, 10000);

  // Her income only accrues in the second phase.
  assert.equal(r.income.her, 20000 * 2);
  assert.equal(r.income.him, 25000 * 4);
}

// ---- 6. Phase boundaries, from each phase's own start month ----
{
  const START = '2026-09';
  const phases = [
    { id: 'a', label: 'A', from: '2026-09', months: 2, income: [], schemeId: 'standard', foodPayer: 'split' as const },
    { id: 'b', label: 'B', from: '2026-11', months: 3, income: [], schemeId: 'standard', foodPayer: 'split' as const },
  ];
  assert.equal(totalMonths(phases, START), 5);
  assert.equal(phaseOf(phases, 0, START)?.id, 'a');
  assert.equal(phaseOf(phases, 1, START)?.id, 'a');
  assert.equal(phaseOf(phases, 2, START)?.id, 'b');
  assert.equal(phaseOf(phases, 4, START)?.id, 'b');
  assert.equal(phaseOf(phases, 5, START), null, 'past the end is not a phase');
}

// ---- 6b. A phase says where it begins, so a gap is allowed ----
// Nothing covers the gap months, and the plan still reaches its furthest end.
{
  const START = '2026-09';
  const phases = [
    { id: 'a', label: 'A', from: '2026-09', months: 1, income: [], schemeId: 'standard', foodPayer: 'split' as const },
    { id: 'b', label: 'B', from: '2026-12', months: 2, income: [], schemeId: 'standard', foodPayer: 'split' as const },
  ];
  assert.equal(totalMonths(phases, START), 5, 'reaches the end of the later phase');
  assert.equal(phaseOf(phases, 0, START)?.id, 'a');
  assert.equal(phaseOf(phases, 1, START), null, 'October is not covered');
  assert.equal(phaseOf(phases, 2, START), null, 'nor November');
  assert.equal(phaseOf(phases, 3, START)?.id, 'b');

  // Moving the later phase does not disturb the earlier one.
  const moved = [phases[0], { ...phases[1], from: '2027-01' }];
  assert.equal(phaseOf(moved, 0, START)?.id, 'a', 'the first phase stays put');
  assert.equal(phaseOf(moved, 4, START)?.id, 'b');
  assert.equal(totalMonths(moved, START), 6);
}

// ---- 7. Food forecast still matches the spec ----
{
  const f = foodForecast(DEFAULT_CONFIG.food);
  assert.equal(Math.round(f.perDay), 503);
  assert.equal(Math.round(f.perMonth), 15086);
  assert.equal(f.budgetPerMonth, 15000);

  const coffee = f.extras.find((e) => e.id === 'coffee');
  assert.ok(coffee, 'coffee survives as a recurring extra');
  assert.equal(Math.round(coffee.perSkippedRun), 536);
  assert.equal(Math.round(f.extrasPerDay), Math.round(coffee.perDay));
}

// ---- 7b. Extras are a list, not a single hard-coded coffee layer ----
{
  const c = clone(DEFAULT_CONFIG);
  const before = foodForecast(c.food).perDay;
  c.food.extras.push({ id: 'gym', label: 'Gym', cost: 70, perWeek: 2 });
  const after = foodForecast(c.food);
  assert.equal(Math.round((after.perDay - before) * 7), 140, 'a second extra lands on top');
  assert.equal(after.extras.length, 2);

  // Day types are averaged by frequency; extras are spread over the whole week
  // regardless of which kind of day it is. Removing every extra leaves meals alone.
  c.food.extras = [];
  const bare = foodForecast(c.food);
  assert.equal(bare.extrasPerDay, 0);
  assert.equal(bare.perDay, bare.foodPerDay);
}

// ---- 7c. Categories are configurable and open-ended ----
{
  assert.ok(
    DEFAULT_CONFIG.food.categories.length >= 3,
    'the original three categories survive as defaults',
  );
  for (const id of ['groceries', 'eatout', 'coffee']) {
    assert.ok(
      DEFAULT_CONFIG.food.categories.some((c) => c.id === id),
      `${id} is still offered, so existing entries keep their label`,
    );
  }
  // Every id must satisfy the database's slug constraint.
  for (const c of DEFAULT_CONFIG.food.categories) {
    assert.match(c.id, /^[a-z0-9][a-z0-9_-]{0,31}$/, `${c.id} is a valid category id`);
  }
}

// ---- 7d. A config written before extras existed still forecasts correctly ----
{
  // The exact shape stored before coffee became one extra among many.
  const legacy = {
    dayTypes: [
      { id: 'tipid', label: 'Tipid', amount: 150, perWeek: 2 },
      { id: 'mid', label: 'Not-so-tipid', amount: 445, perWeek: 3 },
      { id: 'lax', label: 'Not tipid at all', amount: 755, perWeek: 2 },
    ],
    coffee: { cost: 125, perWeek: 3 },
    daysPerMonth: 30,
    dailyBudget: 500,
  } as unknown as LegacyFoodConfig;

  const migrated = migrateFood(legacy);
  assert.equal(migrated.extras.length, 1, 'coffee is lifted into extras');
  assert.equal(migrated.extras[0].cost, 125);
  assert.equal(migrated.extras[0].perWeek, 3);
  assert.ok(migrated.categories.length > 0, 'categories are seeded');
  assert.equal(
    (migrated as LegacyFoodConfig).coffee,
    undefined,
    'the old key does not round-trip back to the database',
  );

  // The whole point: the forecast is unchanged by the migration.
  const f = foodForecast(migrated);
  assert.equal(Math.round(f.perDay), 503);
  assert.equal(Math.round(f.perMonth), 15086);
}

// ---- 8. Any number of named sources feed the right person ----
// Income used to be three fixed slots; it is a list now, so a phase can carry
// as many as the couple actually have.
{
  const c = clone(DEFAULT_CONFIG);
  c.phases[0].income.push({ id: 'hustle', label: 'Side hustle', owner: 'her', amount: 5000 });
  const r = computePlan(c, { includeUncertain: true, includePending: false });
  // Her baseline net, plus the side hustle for the two months of phase one.
  assert.equal(Math.round(r.net.her), -26675 + 5000 * 2);

  // A second source on the same person stacks rather than replacing.
  const two = clone(c);
  two.phases[0].income.push({ id: 'tutoring', label: 'Tutoring', owner: 'her', amount: 3000 });
  const r2 = computePlan(two, { includeUncertain: true, includePending: false });
  assert.equal(Math.round(r2.net.her), Math.round(r.net.her) + 3000 * 2);

  // And its label is what the month breakdown will show.
  assert.equal(two.phases[0].income.at(-1)?.label, 'Tutoring');
}


// ---- 9. A phase shadowed by another owns nothing, and says so ----
// Two phases claiming the same months is easy to do by hand and silently made
// every figure for the later one read as zero.
{
  const c = clone(DEFAULT_CONFIG);
  c.phases = [
    { id: 'a', label: 'First', from: '2026-09', months: 3, income: [], schemeId: 'standard', foodPayer: 'split' },
    { id: 'b', label: 'Second', from: '2026-09', months: 3, income: [], schemeId: 'standard', foodPayer: 'split' },
    { id: 'c', label: 'Third', from: '2026-11', months: 2, income: [], schemeId: 'standard', foodPayer: 'split' },
  ];
  const spans = phaseSpans(c, 0);

  const first = spans.find((s) => s.phase.id === 'a')!;
  const second = spans.find((s) => s.phase.id === 'b')!;
  const third = spans.find((s) => s.phase.id === 'c')!;

  assert.equal(first.ownedMonths, 3, 'the earlier phase keeps all of its months');
  assert.deepEqual(first.shadowedBy, []);

  assert.equal(second.ownedMonths, 0, 'the one behind it owns nothing at all');
  assert.deepEqual(second.shadowedBy, ['First']);

  assert.equal(third.ownedMonths, 1, 'and a partial overlap loses only what is taken');
  assert.deepEqual(third.shadowedBy, ['First']);
}

console.log('all engine assertions passed');
