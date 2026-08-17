# Production Environment Setup (ready-to-execute)

Owner-approved plan: **prepare now, create later.** Execute this runbook
immediately before onboarding the first paying organization. Est. 30–45 min.

## 1 · Create the project

1. Supabase dashboard (or MCP `create_project`): name `novakore-prod`,
   same region as dev (us-west-1), strong DB password → password manager.
2. Record the project ref: `<PROD_REF>`.
3. Enable leaked-password protection (Auth → Providers → Password).

## 2 · Apply schema + platform seed

1. From a clean `main`: `supabase link --project-ref <PROD_REF>` then
   `supabase db push` (applies all 36+ migrations in order).
2. **Do NOT run the dev seed.** Production seeding is limited to: the
   platform administrator row for the owner's real account, and
   `provision_organization(name, slug, owner_email)` per customer. No
   fixture users, no dev password, no demo content.
3. Verify: `list_migrations` matches the repo; `select count(*) from
pg_policies` ≈ 119+.

## 3 · Edge Functions + schedules

1. Deploy `bfh-handoff` and `webhook-worker` to the prod ref.
2. Set `NOVAKORE_SITE_URL` on `bfh-handoff` to the production host.
3. Recreate the pg_cron outbox schedule (see migration
   20260729221240/221909) using the PROD anon JWT.

## 4 · Wire the app (fail-closed flips automatically)

1. Vercel → novakore project → Environment Variables, **Production scope
   only**: `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` →
   prod values; add `NOVAKORE_PROD_REF=<PROD_REF>`. Registering that ref
   automatically tightens the guard: the dev database then counts as drift
   in production and fails the build.
2. Preview scope keeps the dev project values. From this moment
   `scripts/env-check.mjs` fails any production build pointing at dev AND
   any preview build pointing at prod.
3. Supabase (prod) Auth → URL configuration: site URL + redirect allowlist
   for the production host.

## 5 · Secrets

Per-org BFH secrets (`app.bfh_integration_config`, hashed API keys) are
provisioned per customer via the secure process — never copied from dev.
CI keeps using the DEV project for the real-DB suite (tests must never
point at prod; env-check's non-production guard enforces this for builds,
and the test env vars are dev-only by policy).

## 6 · Verification gate (all must pass before go-live)

- [ ] `https://<prod-host>/api/health` → 200, `environment: "production"`.
- [ ] Sign-in with the owner's real account (created via Supabase Auth
      invite, not seed) succeeds; `/select-org` lists only real orgs.
- [ ] A canary org provisioned via `provision_organization`, branded,
      one lesson published, one learner enrolled end-to-end — then the
      canary is suspended.
- [ ] Backup visible in dashboard; **restore drill executed onto a scratch
      project and timed** (record in runbook — closes the NOT VERIFIED).
- [ ] A deliberate misconfiguration test: point a preview env at prod →
      build must fail (env-check). Revert.

## 7 · Aftercare

Update DEPLOYMENT_ARCHITECTURE.md and V1_EXIT_CRITERIA.md statuses, record
the date here, and rotate any dev credential that was ever pasted into a
shared surface during setup.
