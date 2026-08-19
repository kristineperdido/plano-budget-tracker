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

## Live

<https://plano-budget-tracker.vercel.app>

Deploy with `npx vercel --prod` (project is already linked; env vars are set
in Vercel for production, preview and development).

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
- **Auth.** Magic-link sign-in, gated on an allowlist. `app_members` holds the
  permitted email addresses; `is_member()` checks the JWT's email against it and
  every RLS policy calls it. Signing up is deliberately not enough to see
  anything, and the `anon` role has no table privileges at all. Add a person
  with:

  ```sql
  insert into app_members (email, label) values ('them@example.com', 'Him');
  ```

- **Auth redirect.** Supabase must list the deployed origin under
  Authentication → URL Configuration, otherwise magic links bounce to the
  Site URL instead of the app.
