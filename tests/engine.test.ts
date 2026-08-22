import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, migrateFood, type Config, type LegacyFoodConfig } from '@/lib/config';
import { computePlan, foodForecast, applyPayer, phaseOf, totalMonths } from '@/lib/engine';

const clone = (c: Config): Config => JSON.parse(JSON.stringify(c));

// ---- 1. The plan's output ----
//
// Reconciled against jhay's own cutoff spreadsheet. Four corrections came out
// of that: income is 27,900 (13,950 a cutoff, twice a month), Mama's is 3,000,
// and Frosty and drinking water stay split — his sheet charged him the whole of
// both, and double-charged laundry and maintenance by putting a monthly figure
// in each cutoff. The plan also runs five months now rather than two, to cover
// the same window his sheet does.
{
  const r = computePlan(DEFAULT_CONFIG, { includeUncertain: true, includePending: false });
  console.log('herNet   ', Math.round(r.net.her));
  console.log('himNet   ', Math.round(r.net.him));
  console.log('combined ', Math.round(r.combined));
  assert.equal(r.months, 5);
  assert.equal(Math.round(r.net.her), -24720);
  assert.equal(Math.round(r.net.him), 16163);
  assert.equal(Math.round(r.combined), -8558);
  assert.equal(r.backup.him, 10819);

  // Food is charged at the allowance for the days actually lived there:
  // 16 of September from the 15th, then whole months.
  assert.equal(r.food.total, 500 * (16 + 31 + 30 + 31 + 31));

  // The forecast still runs above the allowance, and says so rather than being
  // quietly priced in.
  assert.equal(Math.round(r.foodVariance.gap), 514);
}

// ---- 2. Toggles actually move the model ----
{
  const withU = computePlan(DEFAULT_CONFIG, { includeUncertain: true, includePending: false });
  const noU = computePlan(DEFAULT_CONFIG, { includeUncertain: false, includePending: false });
  assert.equal(Math.round(withU.net.her - noU.net.her), 10000, "brother's money is worth exactly 10k to her");
  assert.equal(withU.net.him, noU.net.him, 'uncertain money is hers, not his');

  const withP = computePlan(DEFAULT_CONFIG, { includeUncertain: true, includePending: true });
  // appliances 5000 split; termination fee is 0 until they learn it
  assert.equal(Math.round(withU.net.her - withP.net.her), 2500);
  assert.equal(Math.round(withU.net.him - withP.net.him), 2500);
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
    { id: 'a', label: 'A', months: 1, income: { her: 0, him: 27400, herSideHustle: 0 }, schemeId: 'standard', foodPayer: 'split' },
    { id: 'b', label: 'B', months: 1, income: { her: 30000, him: 27400, herSideHustle: 0 }, schemeId: 'standard', foodPayer: 'split' },
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
  // count the same 40,000 twice.
  assert.equal(first.moneyIn.her, 0, 'a slice does not claim the savings');
  assert.equal(second.moneyIn.her, 0);
  assert.equal(whole.moneyIn.her, 40000 + 10000);

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
      label: 'Between jobs',
      months: 2,
      income: { her: 0, him: 27900, herSideHustle: 0 },
      schemeId: 'standard',
      foodPayer: 'split',
    },
    {
      id: 'employed',
      label: 'She is working',
      months: 2,
      income: { her: 20000, him: 27900, herSideHustle: 0 },
      schemeId: 'even',
      foodPayer: 'split',
    },
  ];
  const r = computePlan(c, { includeUncertain: true, includePending: false });
  assert.equal(r.months, 4);

  // Rent is active months 1..3. Month 1 is his (phase 1); months 2-3 split.
  const rent = r.items.find((b) => b.item.id === 'rent')!;
  assert.equal(rent.occurrences, 3);
  assert.equal(rent.split.him, 11500 + 11500 / 2 + 11500 / 2);
  assert.equal(rent.split.her, 11500);

  // Her income only accrues in the second phase.
  assert.equal(r.income.her, 20000 * 2);
  assert.equal(r.income.him, 27900 * 4);
}

// ---- 6. Phase boundaries ----
{
  const phases = [
    { id: 'a', label: 'A', months: 2, income: { her: 0, him: 0, herSideHustle: 0 }, schemeId: 'standard', foodPayer: 'split' as const },
    { id: 'b', label: 'B', months: 3, income: { her: 0, him: 0, herSideHustle: 0 }, schemeId: 'standard', foodPayer: 'split' as const },
  ];
  assert.equal(totalMonths(phases), 5);
  assert.equal(phaseOf(phases, 0)?.id, 'a');
  assert.equal(phaseOf(phases, 1)?.id, 'a');
  assert.equal(phaseOf(phases, 2)?.id, 'b');
  assert.equal(phaseOf(phases, 4)?.id, 'b');
  assert.equal(phaseOf(phases, 5), null, 'past the end is not a phase');
}

// ---- 7. Food forecast still matches the spec ----
{
  const f = foodForecast(DEFAULT_CONFIG.food);
  assert.equal(Math.round(f.perDay), 517);
  assert.equal(Math.round(f.perMonth), 15514);
  assert.equal(f.budgetPerMonth, 15000);

  const coffee = f.extras.find((e) => e.id === 'coffee');
  assert.ok(coffee, 'coffee survives as a recurring extra');
  assert.equal(Math.round(coffee.perSkippedRun), 557);
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
      { id: 'tipid', label: 'Tipid', amount: 160, perWeek: 2 },
      { id: 'mid', label: 'Not-so-tipid', amount: 450, perWeek: 3 },
      { id: 'lax', label: 'Not tipid at all', amount: 780, perWeek: 2 },
    ],
    coffee: { cost: 130, perWeek: 3 },
    daysPerMonth: 30,
    dailyBudget: 500,
  } as unknown as LegacyFoodConfig;

  const migrated = migrateFood(legacy);
  assert.equal(migrated.extras.length, 1, 'coffee is lifted into extras');
  assert.equal(migrated.extras[0].cost, 130);
  assert.equal(migrated.extras[0].perWeek, 3);
  assert.ok(migrated.categories.length > 0, 'categories are seeded');
  assert.equal(
    (migrated as LegacyFoodConfig).coffee,
    undefined,
    'the old key does not round-trip back to the database',
  );

  // The whole point: the forecast is unchanged by the migration.
  const f = foodForecast(migrated);
  assert.equal(Math.round(f.perDay), 517);
  assert.equal(Math.round(f.perMonth), 15514);
}

// ---- 8. Side hustle feeds her income ----
{
  const c = clone(DEFAULT_CONFIG);
  c.phases[0].income.herSideHustle = 5000;
  const r = computePlan(c, { includeUncertain: true, includePending: false });
  // Her baseline net, plus the side hustle for the two months of phase one.
  assert.equal(Math.round(r.net.her), -24720 + 5000 * 2);
}

console.log('\nall engine assertions passed');
