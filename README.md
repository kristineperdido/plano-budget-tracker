# Plano

Shared living budget + daily food tracker for two people.
Next.js (App Router) + TypeScript + Tailwind + Supabase. Mobile-first.

Spec: [PLANO-HANDOFF.md](./PLANO-HANDOFF.md)

## Setup

```bash
cp .env.example .env.local   # fill in the Supabase URL + anon key
npm install
npm run dev
```

## Built so far

- **Today** (`/`) — buffer headline, monthly progress with pace marker,
  today's entries, recent days, floating + to log.

Screens still to build: Plan, Ledger, Food, What-if, Pending, Log.

## Notes

- **Timezone.** Every date is the *Manila* calendar day (`src/lib/date.ts`).
  `spent_on` is a bare `date` and the database clock is UTC, so deriving "today"
  from UTC would roll the buffer over at 8am Manila time.
- **Money.** Stored as `numeric(10,2)`; PostgREST can hand it back as a string,
  so rows are coerced through `coerceEntry` on the way in.
- **Realtime.** The Today screen subscribes to `food_entries` changes so an
  entry logged on one phone shows up on the other.
- **Auth.** There is none yet — RLS is wide open on the anon key, which means
  anyone with the key can read, edit and delete everything. See Open Items in
  the handoff before this goes anywhere public.
