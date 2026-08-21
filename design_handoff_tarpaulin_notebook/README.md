# Handoff: Plano — "Tarpaulin & Notebook" restyle

## Overview

Plano is a shared living-budget and daily-food tracker for two people (Next.js App Router + TypeScript + Tailwind + Supabase, Manila timezone, PHP). It already works. **This handoff is a visual restyle, not a rewrite** — no schema changes, no new routes, no changes to the calculation engine.

The new direction dresses the app as a Filipino sari-sari store: a hand-painted **tarpaulin** header over **ruled notebook paper**, prices in marker, masking tape holding panels down, tally marks instead of charts. The point of the style is that it's warm and hand-made *while every peso amount stays in clean tabular mono* — in a real store the numbers are the one thing written carefully.

Three screens (What-if, Pending, Log) are designed but **not yet built** in the app; the rest are restyles of existing screens.

## About the design files

`reference-screens.html` in this folder is a **design reference created in HTML** — a prototype showing intended look, not production code to copy. Open it in a browser and read it alongside this README. The task is to recreate these designs in the existing Next.js + Tailwind codebase using its established patterns (`Screen`, `Row`, `Signed`, `AmountField`, `MonthProgress`, etc.), not to paste the HTML in.

`globals.css` **is** meant to be used: it's a drop-in replacement for `src/app/globals.css`, written in the same shape as the current file (`@import 'tailwindcss'` + `:root` custom properties + semantic utility classes).

## Fidelity

**High-fidelity.** Colours, type sizes, spacing, and rotations are final and exact. Recreate pixel-perfectly. Where the reference and this README disagree, trust this README.

---

## What survives from the current app

Do not change any of these:

- **The whole calculation layer** — `src/lib/model.ts`, `src/lib/date.ts`, `DAILY_BUDGET`, `php()`, `php2()`, `TodayStats`, `projectedMonth`, `paceProgress`, all Manila-day logic.
- **Money precision rules.** `php()` (rounded) for plans and forecasts; `php2()` (two decimals) for logged entries and today's total. Logged money is exact; planned money is not.
- **Semantic colour meanings.** Green = under budget / surplus. Brick = over budget / deficit. Gold = pending / uncertain / not yet trustworthy. One meaning each; never borrowed for decoration.
- **Supabase queries, realtime subscription on Today, magic-link auth, the allowlist.**

## What changes

| Area | From | To |
|---|---|---|
| Ground | flat `--paper` | ruled notebook paper + red margin rule |
| Headers | Georgia serif text | painted tarpaulin bar with eyelets + stripe |
| Display type | Georgia | **Anton** (condensed signage) |
| Asides / empties | Georgia italic | **Caveat** (marker handwriting) |
| Amounts | system mono | **unchanged** — system mono, tabular |
| Radii | 2px | **0** everywhere except the round FAB |
| Shadows | 1px hairline | hard offset shadows, no blur |
| Payer | `(Her)` / `(Him)` parenthetical | marker name + filled/hollow shape mark |
| Charts | progress bars only | bars *plus* hand tally marks |

---

## Design tokens

All tokens live in `globals.css`. Values here for reference.

### Colour

| Token | Hex | Use |
|---|---|---|
| `--paper` | `#f4ead1` | screen ground (warmed from `#f0e6ce`) |
| `--paper-light` | `#fbf6e8` | — |
| `--paper-panel` | `rgb(251 246 232 / .72)` | panels sitting on ruled paper |
| `--ink` | `#241e15` | all body text, tarp background, outlines |
| `--green` | `#3e5c3b` | under budget, surplus |
| `--brick` | `#b5432e` | over budget, deficit, primary button, margin rule |
| `--gold` | `#c1861e` | pending, uncertain, active tab underline |
| `--charcoal` | `#6e6350` | labels, meta, secondary text |
| `--rule` | `#cbbb95` | borders, dividers |
| `--rule-soft` | `#a79a80` | underline on editable amounts |
| `--track` | `#e5d8b7` | progress-bar track |
| `--teal` | `#2f7a82` | **NEW** — ruled lines (at 13% alpha), small-caps labels, eyelets |
| `--tape` | `rgb(222 154 143 / .5)` | **NEW** — masking tape |

**Rule:** `--teal` and `--tape` are structural only. Neither may ever be applied to a number. Ruled lines render at `rgb(47 122 130 / 0.13)`.

### Type

Load from Google Fonts: `family=Anton&family=Caveat:wght@400;600;700`.

| Role | Family | Sizes |
|---|---|---|
| Signage | Anton, uppercase, `letter-spacing: .03–.2em` | screen title 25px · section label 11px/.16em · button 13px/.12em · tab 11px/.1em |
| Marker | Caveat, weight 600 | asides 19–25px · payer name 17px · empty states 19px |
| Body | system sans | rows 13.5px · meta 11.5–12.5px |
| **Money** | system mono, `tabular-nums`, `-.02em` | buffer 54px · panel total 27px · forecast 52px · row 14–15px · meta 11.5–13px |

Never set an amount in Anton or Caveat. Never rotate an amount. Never uppercase an amount.

### Geometry

- Ruled line pitch **34px** (`transparent 0 33px, teal 33px 34px`).
- Red margin rule at **34px** from left. Screen content padding `0 16px 0 44px` so it clears the rule.
- Border radius **0** everywhere. Only exception: the 54px round FAB.
- Borders 1px `--rule`; tarp stripe 5px; pace bar 13px tall.
- Shadows: tarp `0 3px 0 rgb(36 30 21 / .16)`; panels none; primary button `0 4px 0 rgb(36 30 21 / .25)`; FAB `0 5px 0 rgb(36 30 21 / .22)`. **Never a blurred shadow.**
- Rotations (the only "hand" in the system): marker asides `-4°` to `+4°`; tape `±2–2.6°`; stamps `±1–2°`; tally strokes `±2–7°`. Panels and rows are never rotated.
- Minimum tap target 44px.

---

## Components

### Tarpaulin header — `.tarp`
Every screen starts with one. `--ink` background, `0 3px 0` shadow, two 7px `--paper` circles at 50% opacity in the top corners (eyelets), title in Anton 25px uppercase `--paper` on the left, an Anton 11px/.2em meta label in `--gold` on the right, and a 5px `.tarp-stripe` along the bottom: `repeating-linear-gradient(to right, gold 0 16px, teal 16px 32px, brick 32px 48px)`.

Right-hand meta per screen: Today `AUG 20` · Plan `5 MONTHS` · Ledger `saving…` (Caveat, gold) · Food `OVER` (brick) · What-if `NOT SAVED` · Pending `2 ITEMS` · Log `14 CHANGES` · Settings `close`.

### Ruled paper — `.paper` / `.paper-body`
Applies the background gradient and the `::before` margin rule. Wrap the scrolling area.

### Panel — `.panel`
1px `--rule`, `--paper-panel` background, 14px padding, no radius, no shadow. Panels that carry weight get a `.tape` strip poking out the top edge, offset 20–26px from one side, rotated ±2°. Use tape sparingly — one per screen, two at most.

### Rows — `.row`
Payer mark (52px fixed) · label (flex) · amount (mono, right). Dotted 1px `--rule` divider, none on the last child. Editable amounts get `.amount-editable` (dotted `--rule-soft` underline) — this is the affordance that says "tap me", replacing the current `AmountField` styling.

### Who paid — `.payer`
**This replaces the `(Her)` / `(Him)` parentheticals and any single-letter initials.** Two parts:

1. A 9px square **mark** — filled `--ink` for person A, 2px hollow outline for person B, both overlapping (`-3px` margin) for a shared cost.
2. The **name in Caveat 17px lowercase** — `tin`, `jhay`, `both`.

Shape carries the meaning so it reads before the word does; the name removes all ambiguity. Lowercase on purpose — it's a jotted note. Splits show a `50/50` note in 11.5px sans beside the name, never a second row. **Do not colour-code people** — green/brick/gold are spoken for.

Wire the names to `app_members.label` (currently `Her` / `Him` in `PAYER_LABEL` and `personLabel`); the design uses `tin` / `jhay`. `personLabel` currently renders `You` for the signed-in user — keep that behaviour, just restyle it.

### Pace bar — `.pace`
13px tall, `--track` fill, 1px `--rule` border. Green fill at 82% opacity = share of month budget spent; switches to `--brick` when `spentMonth > accrued`. A 2px `--ink` vertical rule at `paceProgress`, overhanging 4px top and bottom. Below: day count in 11px sans left, and **a Caveat aside** right (`on pace`, `₱820 over`) — this replaces the mono `Pace → ₱14,229` label, though keep the projected figure available.

### Tally marks — `.tally`
2.5px × 18–20px strokes, 4px gap, each rotated irregularly (±2–7°). Fifth stroke is a 19px × 2px diagonal slash at `-13°`. Coloured by meaning: green under, gold middling, brick over. Used for recent days (Today), days-per-week per day type (Food), and coffee runs.

### Stamps — `.stamp`
Anton 9.5px/.1em, 1.5px `currentColor` border, 4px 6px padding, rotated ±1.6°. `PENDING`/`UNCERTAIN` gold, `VIABLE` green, `TIGHT` gold, `OVER` brick.

### Buttons — `.btn`
Primary: `--brick` fill, `--paper` text, Anton 13px/.12em, `0 4px 0` hard shadow, `:active` translates 3px down into its own shadow. Ghost: 1px `--rule`, charcoal text. Dashed "add" affordances use Caveat, not Anton (`+ add to allowlist`).

### Toggle — `.toggle`
42×23px square, `--rule` off / `--ink` on, 17px square `--paper` knob, no radius, no transition curve fancier than 120ms linear.

### FAB — `.fab`
54px round, `--brick`, `+` in Anton 30px, `0 5px 0` shadow. Bottom-right, 18px in, clearing the tab bar. The only circle in the design.

### Tab bar — `.tabs`
`--ink` board. Five tabs, Anton 11px/.1em: `TODAY · PLAN · LEDGER · FOOD · MORE`. Inactive `#8c8271`, active `--paper` with a 3px `--gold` bottom border. **`MORE` is new** — it opens a sheet listing What-if, Pending, Log, Settings, since nine screens don't fit four tabs. Add it to the `TABS` array in `src/components/TabBar.tsx`.

### Empty & loading — `.empty`
Always Caveat, always charcoal, always in character. `wala pang laman` · `reading the ledger…` · `working the numbers…`. Never a spinner where a sentence will do.

---

## Screens

Reference ids below match the anchors in `reference-screens.html`.

### Today — `3a` → `src/app/page.tsx`
Tarp header. Then, centred: an Anton 11px/.2em `--teal` label `AVAILABLE TO SPEND`; the buffer at mono 54px in green (brick when negative); and a **hand-drawn circle around it** — an absolutely-positioned `border: 2.5px solid var(--brick)`, `border-radius: 50% 48% 52% 50%`, `rotate(-3.4deg)`, 85% opacity. A Caveat aside sits to its right (`pwede pa ito`, rotated 4°). Below: derivation in 12.5px sans (`₱500 × 20 days = ₱10,000 / spent ₱9,180`).

Then a taped panel with the month pace bar. Then `TODAY` — entry rows with payer marks, two-decimal amounts, and a dotted total. Then `RECENT DAYS` — date, tally marks, day total. A Caveat closer: `3 tipid days and you're level`.

Keep: realtime subscription, delete affordance on each entry, `php2()` amounts.

### Plan — `3e` → `src/app/plan/page.tsx`
Phases as a strip of Anton chips, active one filled `--ink` and rotated `-0.8°`. Score panel (taped): each person's net with their payer mark above it, then `COMBINED` in mono 27px. Two Anton toggle-chips for `UNCERTAIN MONEY ON` / `PENDING ITEMS OFF`. Then `WHERE IT GOES` rows, then `LOGGED VS FORECAST` as two bars with a Caveat verdict (`running ₱1,740/mo under`).

**New:** multi-phase support (the spec's open item #4). Phases are a first-class list, not a hardcoded two-stage plan.

### Ledger — `3f` → `src/app/ledger/page.tsx`
Three grouped sections — `MOVE-IN`, `EVERY MONTH`, `MONEY IN` — each with an Anton label, a leader rule, and a mono subtotal on the same line. Rows carry payer mark + editable amount. Cadence/payer/month-offset chips only appear on the row being edited. `Food` is marked `derived` in Caveat gold and is not editable. Keep the inline-save behaviour and the `saving…` indicator (now Caveat in the tarp).

### Food — `3b` → `src/app/food/page.tsx`
Big forecast per day in mono 52px, brick when over the ₱500 budget, with a Caveat aside (`₱17 lang sobra`). Taped panel `ONE WEEK — 7 DAYS`: three day types, each with amount and a tally row + Caveat day count. Weighted meals total. Separate `COFFEE — SEPARATE` panel — per-run cost, tally of runs, and a Caveat green payoff line (`Drop one run a week → tipid ₱557`). Coffee is an independent layer, not a day type.

### Logging — `3g` → new sheet component
Bottom sheet over a dimmed screen, two tape strips holding it down. Opens **day-type first**: `Anong araw?` with three tappable rows (Tipid ₱160 / Not-so-tipid ₱450 / Not tipid at all ₱780), selected one filled `--ink`. A coffee toggle adds ₱130. Payer picked from three Caveat chips. Live total in mono 29px with a Caveat warning in brick if it breaches the buffer. Primary `LOG THE DAY`, ghost `ITEMISE` drops to a per-item keypad for odd days.

One tap covers most nights. Keep the existing date-offset control (today / yesterday / 2 days).

### What-if — `3c` → **new** `src/app/what-if/page.tsx`
Caveat headline (`Drag freely. / Nothing breaks.`) and the contract in plain sans: nothing saves until Apply. Four sliders — food per day, kuya repays, side hustle per month, months without income — as 5px tracks with **19px square gold handles**, each rotated a few degrees. Taped result panel: three nets (Tin / Jhay / Both) and options A/B/C each with a live stamp. `RESET` ghost + `APPLY TO PLAN` primary. Purely local state until Apply.

### Pending — `3h` → **new** `src/app/pending/page.tsx`
Caveat intro explaining the whole point: known, but not numbered, and deliberately excluded so the plan doesn't look worse than reality. One panel per item: Anton title, `PENDING` stamp, sans description, an estimate row (`???` in Caveat 26px gold when unknown, a mono range when partly known), `CONFIRM IN` + `DROP` buttons. A footer computes the worst case and a Caveat verdict. Dashed `+ isa pang hindi pa sigurado` to add.

### Log — `3i` → **new** `src/app/log/page.tsx`
Newest first. Each change: mono timestamp left, payer mark + Caveat name right, then the change in 13.5px sans. Dotted dividers. Append-only.

### Settings — `3j` (first card) → **new** `src/app/settings/page.tsx`
`WHO'S IN` (payer mark, Caveat name, mono email, Anton role), `PHASES`, `THE BASICS` (daily budget, days per month, roll-leftover toggle). A Caveat note explains the Manila-day rule. Brick outlined `SIGN OUT`.

### Sign in — `3j` (second card) → `src/components/AuthGate.tsx`
**The one screen that inverts.** Full `--ink` ground with a rolled-shutter texture at the top (`repeating-linear-gradient(to bottom, rgb(244 234 209 / .14) 0 5px, transparent 5px 10px)`). Wordmark in Anton 54px, the tarp stripe beneath it, a Caveat tagline. The email form is a slab of ruled paper laid on the dark ground with a `0 6px 0` shadow. Caveat note: no passwords, and you must be on the allowlist. `MANILA · PHP` in Anton 10px/.2em at the foot.

---

## Copy & tone

Neutral and factual about money; warm in the asides. Tagalog appears only where it's genuinely the users' own vocabulary — **tipid**, **palengke**, **kape**, **merienda**, **pwede pa**, **sobra** — and mostly in Caveat asides, never in labels a stranger would need to parse. Everything structural is English. Do not add more Tagalog; do not translate the UI.

Never joke about being broke. An over-pace state is stated plainly and offers a way back (`3 tipid days and you're level`), never scolded.

## Interactions

- Primary buttons translate 3px down into their shadow on `:active`. That's the only motion the style needs.
- Ledger amounts save on blur, with the `saving…` indicator in the tarp.
- What-if recomputes on drag; commits only on Apply.
- Pending items never affect any total until confirmed.
- Rotations are static, authored per element. Do not randomise at runtime — it makes diffs and screenshots unstable.
- Respect `prefers-reduced-motion`: drop the button translate.

## Accessibility

- Verify contrast after the paper warm-up: charcoal `#6e6350` on `#f4ead1` is ~4.6:1 — fine for 12px+ but do not go lighter.
- Caveat is decorative. Never put information *only* in Caveat that isn't also available elsewhere — and keep it at 17px+.
- Anton is uppercase-only in this design; give screen readers normal-case text and uppercase via CSS, not in the string.
- Payer identity must not rely on the shape mark alone — the name is always present.
- Tally marks are decorative duplicates of a number that's always adjacent; mark them `aria-hidden`.

## Files in this bundle

- `README.md` — this document
- `globals.css` — drop-in replacement for `src/app/globals.css`
- `reference-screens.html` — the nine design screens, openable in a browser

## Suggested order of work

1. Drop in `globals.css`, load Anton + Caveat in `src/app/layout.tsx`.
2. Restyle the shared chrome: `Screen`, `TabBar` (add `MORE`), `Money`/`Row`, `AmountField`, `MonthProgress`.
3. Introduce the payer component; migrate `PAYER_LABEL` / `personLabel` off `Her`/`Him`.
4. Restyle Today, then Plan, Ledger, Food.
5. Build the new logging sheet.
6. Build What-if, Pending, Log, Settings and the `MORE` sheet.
7. Restyle `AuthGate`.

## Open questions for the product owner

- `app_members.label` currently holds `Her` / `Him`; the design says `tin` / `jhay`. Confirm the real names before migrating.
- The handoff spec says RLS is wide open with no per-person auth, while the README says magic-link + allowlist is live. Confirm which is true — it changes whether Settings can manage the allowlist.
- The original plan modelled a two-month unemployed stretch from mid-September. Confirm the current phase before wiring real dates.
