# Supabase Development Guide

NovaKore runs against a **dedicated** Supabase project: `novakore-dev`
(region `us-west-1`). It shares nothing — credentials, schema, storage, auth,
lifecycle — with any other project. The Built For Her and G3 Performance
projects are never used by NovaKore.

## Source of truth

**Migration files in `supabase/migrations/` are the schema's source of
truth.** Dashboard-created schema is never authoritative. Any configuration
that can only be set in the dashboard must be documented in
[remote-configuration.md](remote-configuration.md) so it is reproducible.

## Environment setup

1. Copy `apps/web/.env.example` → `apps/web/.env.local`.
2. Fill values from the Supabase dashboard (`novakore-dev` → Project
   Settings → API):
   - `NEXT_PUBLIC_SUPABASE_URL` — the project API URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` — the anon/publishable key
   - `SUPABASE_SERVICE_ROLE_KEY` — service role key (**server-only; optional
     in Phase 1A**)
   - `SUPABASE_PROJECT_ID` — the project ref
   - `SUPABASE_DB_PASSWORD` — set via Project Settings → Database → Reset
     database password (needed only for direct-connection CLI workflows)

Rules (owner-mandated):

- Never commit real credentials. `.env`, `.env*.local` are gitignored —
  keep it that way.
- Never expose `SUPABASE_SERVICE_ROLE_KEY` to browser code and never prefix
  any private key with `NEXT_PUBLIC_`.
- Missing required server env fails fast with a clear error naming the
  variable (never the value) — see `packages/database/src/env.ts`.
- Never print secret values in logs, reports, screenshots, tests, or docs.

## Local stack (Docker required)

The Supabase CLI local stack requires Docker. **Docker is not currently
installed on this machine** — install Docker Desktop to enable the local
workflow. With Docker available:

```bash
npx supabase start
```

```bash
npx supabase db reset
```

`db reset` replays every migration from zero and applies `supabase/seed.sql`
— it must always succeed from scratch. Seeds are deterministic and
repeatable.

## Remote workflow (novakore-dev)

Preferred (after local verification, or while Docker is unavailable):

```bash
npx supabase link --project-ref <SUPABASE_PROJECT_ID>
```

```bash
npx supabase db push
```

`db push` applies exactly the committed migration files and records them in
the remote migration history. Never apply schema by hand in the dashboard
SQL editor except for documented, reproducible seed/QA operations.

## Generated types

Generate TypeScript types from the schema into the database package:

```bash
npm run db:types
```

(defined at the repo root; uses `npx supabase gen types typescript` against
the linked project — or `--local` when the local stack is running — writing
`packages/database/src/types/database.ts`).

**Staleness check** — regenerates to a temp file and diffs against the
committed types; fails if they differ:

```bash
npm run db:types:check
```

Run it after every migration change; CI should treat a diff as a failure.
Do not hand-maintain duplicate row types — import from
`@novakore/database`.

## RLS test strategy (owner decision)

- The automated isolation suite in `packages/database/src/__tests__/` runs
  against a **real** Supabase instance (local stack when Docker is
  available; the `novakore-dev` remote otherwise) using real sign-ins and
  PostgREST — never mocked authorization.
- Required env for the suite: `NOVAKORE_TEST_SUPABASE_URL`,
  `NOVAKORE_TEST_SUPABASE_ANON_KEY` (put them in `.env.test.local`, also
  gitignored). When unset, the suite reports itself as **skipped loudly**;
  a skipped suite does not satisfy the Phase 1A gate.
- Run with:

```bash
npm run test:rls
```

## Key rotation procedure

Rotate whenever a key may have been exposed, a team member departs, or on a
regular cadence:

1. Dashboard → `novakore-dev` → Project Settings → API keys.
2. Rotate the compromised key (service role first — it is the powerful
   one). Supabase issues a new key immediately.
3. Update `apps/web/.env.local` (and any deployment env) with the new
   values. There is exactly one place per environment; nothing else stores
   keys.
4. Restart the dev server / redeploy.
5. If the database password leaked: Project Settings → Database → Reset
   database password, then update `SUPABASE_DB_PASSWORD` wherever used.
6. Record the rotation (date, reason, keys rotated — never the values) in
   the team log / audit trail.
7. If the service-role key was exposed publicly, also review the audit logs
   and Supabase logs for unexpected access during the exposure window.
