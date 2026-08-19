# Plano — Handoff Spec

A shared-living budget + daily food tracker for two people. Built as a Claude artifact first; moving to a real app because artifacts can't reach Supabase (sandbox blocks external fetch).

---

## Stack

- **Next.js (App Router) + TypeScript + Tailwind**
- **Supabase** — project `shared-living-budget`, ref `pqrsuywmbdxlhmmsmaxp`, region `ap-southeast-1`, free tier
- **Vercel** for hosting (free)
- Mobile-first. Both partners open it on their phones.

### Supabase connection

```
NEXT_PUBLIC_SUPABASE_URL=https://pqrsuywmbdxlhmmsmaxp.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_pQyZmaVODxOcNefYawfArw_Jil1er-F
```

### Existing schema (already migrated)

```sql
food_entries (
  id uuid pk default gen_random_uuid(),
  spent_on date not null,
  category text not null check (category in ('groceries','eatout','coffee')),
  amount numeric(10,2) not null check (amount >= 0),
  note text,
  created_at timestamptz not null default now()
)

budget_config (
  id text pk default 'main',
  config jsonb not null,
  updated_at timestamptz not null default now()
)

budget_changelog (
  id uuid pk default gen_random_uuid(),
  note text not null,
  created_at timestamptz not null default now()
)
```

RLS is enabled with permissive anon policies (no auth). **Worth revisiting** — see Open Items.

---

## The situation being modelled

Two people moving in together mid-September. She is between jobs and expects ~2 months without income. The plan covers that 2-month stretch.

### Her
- Income: ₱0 during the stretch
- Savings: ₱40,000
- Brother owes her ₱20,000; ₱10,000 realistically repayable inside the window (**flagged uncertain**)
- Pays the entire move-in cost herself

### Him (BF)
- Income: ₱27,400/month (₱13,700 × 2 cutoffs, 10th & 25th)
- Savings: ₱10,819 (Aug 25–Sep 25 cutoff), not earmarked
- Existing obligation: ₱2,300/month to his mother (₱1,500 allowance + ₱800 WiFi)
- Personal allowance ₱6,000/month — **his food half is drawn from this pot, not on top of it**
- Covers 100% of household bills during her unemployed stretch

---

## Line items

| Item | Amount | Cadence | Payer | Notes |
|---|---|---|---|---|
| Security deposit | ₱23,000 | one-time | Her | 2 months' rent |
| Advance | ₱11,500 | one-time | Her | prepays Month 0 rent |
| Keycard | ₱500 | one-time | Each pays own | not split — ₱500 each |
| Pet fee | ₱3,000 | one-time | 50/50 | annual, per lease contract |
| Rent | ₱11,500 | monthly, **from Month 1** | Him | Month 0 already covered by advance |
| Electric | ₱2,500 | monthly, **from Month 1** | Him | first bill covers Sept–Oct usage |
| Water | ₱500 | monthly, **from Month 1** | Him | same billing lag |
| WiFi | ₱1,000 | monthly, from Month 0 | Him | prepaid, recurring every month |
| Laundry | ~₱640 | monthly, from Month 0 | Him | ₱150–170/week × 4 |
| Maintenance | ₱500 | monthly, from Month 0 | Him | |
| Mama's bills | ₱2,300 | monthly, from Month 0 | Him | his own obligation |
| Frosty (cat) | ~₱1,069 | monthly, from Month 0 | 50/50 | see breakdown below |
| Drinking water | ~₱86 | monthly, from Month 0 | 50/50 | ₱30–50/gallon, ~2 weeks per gallon |
| Interview trips | ~₱583 | one-time | Her | 3 trips × (₱70 transport + ₱99–150 lunch) |
| Food | forecast | monthly | 50/50 | derived — see food model |

### Pending tray (excluded from math until confirmed)
- Early termination fee — amount unknown, must be checked before signing
- Appliances (fridge, wardrobe) — ₱3,000–7,000 estimate

### Frosty's monthly cost (normalize from purchase cycles)
- Dry food ₱570 per 2×1kg bags, lasts ~22 days → ₱777/mo
- Wet food ₱411, lasts ~2 months → ₱206/mo
- Litter ₱129/bag, lasts ~1.5 months → ₱86/mo

---

## Food model

Three day types, plus coffee as a **separate layer on top** (coffee is independent of which day type it is).

| Day type | Cost/day (both people) | Days/week |
|---|---|---|
| Tipid | ₱160 | 2 |
| Not-so-tipid | ₱450 | 3 |
| Not tipid at all | ₱780 | 2 |

Composition, for reference:
- **Tipid** — ₱60 bread breakfast, lunch and dinner from existing grocery stock (~₱0), ₱100 merienda
- **Not-so-tipid** — ₱150 breakfast, ₱200 groceries covering both lunch and dinner, ₱100 merienda
- **Not tipid at all** — ₱200 breakfast (₱100 each), ₱240 eat-out lunch, ₱240 eat-out dinner, ₱100 merienda
- The ₱100 afternoon merienda is constant across all three

**Coffee:** ₱130 per buy-out run, 2–4 runs/week (use 3 as default). Non-run days use Milo/UCC sachets at no marginal cost.

### Derived forecast

```
foodPerDay   = Σ(dayType.amount × dayType.perWeek) / Σ(dayType.perWeek)
coffeePerDay = coffee.cost × coffee.perWeek / 7
perDay       = foodPerDay + coffeePerDay
```

At the defaults: ₱461/day meals + ₱56/day coffee = **₱517/day**, or ₱15,510/month against a ₱15,000 budget (₱500/day × 30). Slightly over — coffee frequency is the main lever.

### Buffer mechanic (the point of daily logging)

- Static ₱500/day budget
- Underspending on a day rolls forward as buffer, spendable on later eat-outs/coffee without counting as "over"
- Whatever remains of the ₱15,000 at month-end goes to savings
- Goal is spotting bad patterns, not restricting

---

## Calculation engine

```
For each line item:
  occurrences = cadence === 'onetime' ? 1 : max(0, months - startMonth)
  total       = amount × occurrences
  payer 'her'   → all to her
  payer 'him'   → all to him
  payer 'split' → total × 0.5 each
  payer 'each'  → full amount to BOTH (per-person cost, not split)

Food is a derived line: perDay × daysPerMonth × months, split 50/50.

herNet = (herIncome + sideHustle) × months + herSavings − herCosts
himNet = himIncome × months − himCosts        // savings shown separately as backup
combined = herNet + himNet
```

**Toggles that must re-run the whole model:**
- *Include uncertain money* — brother's ₱10,000 in or out
- *Include pending items* — appliances / termination fee in or out

### Current output (defaults, uncertain money included, pending excluded)
- Her: roughly −₱3,700 (deficit)
- Him: roughly +₱13,000 (surplus, income only)
- Combined: roughly +₱9,000
- Plus his ₱10,819 savings as untouched backup

### Three options being weighed
- **A — Side hustle.** She earns a little during the gap. Viable; the amount needed is small.
- **B — Wait until November.** BF saves ~₱16,000 more first. Most comfortable, but the ₱11,500 rent may not still be available and it delays move-in ~1.5–2 months.
- **C — Rent now, no hustle.** Conditional — works only if his surplus covers her gap.

---

## Screens

1. **Today** — buffer headline (₱ available or over pace), monthly progress bar, today's entries, recent days list, floating + to log
2. **Plan** — her net / his net / combined, the two toggles, actual-vs-forecast pace pulled from `food_entries`
3. **Ledger** — every line item grouped, editable inline, add/delete; "money in" section for savings sources
4. **Food** — weighted forecast vs budget, editable day types (₱ and days/week), coffee layer with "each skipped weekly run saves ₱X/month"
5. **What-if** — sliders for food/day, brother's repayment, side hustle, months without income; recomputes A/B/C viability live; Apply commits to the real config
6. **Pending** — the tray, each with a "Confirm into plan" action
7. **Log** — changelog, newest first

---

## Design language

Receipt / ledger-book feel — this is a running tally, not a fintech dashboard.

```css
--paper:#F0E6CE; --paper-light:#FBF6E8; --ink:#241E15;
--brick:#B5432E; --green:#3E5C3B; --gold:#C1861E;
--charcoal:#7A6F5D; --rule:#D9CDAE;
```

- Display/headings: Georgia or similar serif
- Numbers: monospace throughout — amounts should align
- Body: system sans
- Dotted leader lines between label and amount on receipt rows
- Green = under budget / surplus, brick red = over / deficit, gold = warning or pending

---

## Open items to build past the artifact version

1. **Who logged it** — add a `person` column to `food_entries` and a name picker. Currently entries are anonymous; needed if the split ever stops being 50/50.
2. **Realtime sync** — Supabase realtime subscription so an entry logged on one phone appears on the other without a reload.
3. **Auth** — RLS is currently wide open on the anon key. Even a shared passphrase or Supabase magic-link auth for two users would be better.
4. **Phases** — the model handles one phase (the 2-month unemployed stretch). Should support a sequence: unemployed → employed, each with its own incomes and payer rules, rather than editing one phase in place.
5. **Month-end rollover** — automatically move leftover budget to a savings figure and start the new month clean.
6. **Offline queue** — log entries while offline, sync when back.
7. **Termination fee** — still unknown. Get it from the contract before signing.
