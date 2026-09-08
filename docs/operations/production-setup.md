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

---

## Execution record — 2026-09-07

Executed by Claude (owner-directed task). `<PROD_REF>` = **`zttrpporfehrrabgbcrh`**
(us-west-1, $10/mo, org JRSTRENGTHANDFITNESS). Production host:
`https://www.novakore.io`.

**Done:**

- §1 Project created; leaked-password protection ENABLED (Auth → Email
  provider); Auth site URL `https://www.novakore.io` + redirect allowlist
  `https://www.novakore.io/**`.
- §2 All 66 repo migrations applied in order via the Supabase MCP
  (`apply_migration`), then history renumbered to the exact repo versions —
  `list_migrations` matches the repo 1:1. 132 RLS policies (≥119 ✓),
  32 permissions, 5 storage buckets, **0 auth users / 0 organizations**
  (fixture-free ✓). Dev seed NOT run.
  - **Deliberate deviation**: `20260820024334_owner_platform_admin_and_timberhill_org`
    was recorded in prod history with a documented **no-op body** — the repo
    file contains dev tenant data (a dev-seeded user UUID whose
    `auth.users` FK cannot resolve on a fresh project, plus Timberhill
    provisioning) and its own header forbids inheriting tenants in a new
    environment. Prod platform-admin grant happens via the owner step below.
  - `pg_cron` was enabled via SQL before the replay (dev had it
    pre-installed outside migration history).
- §3 `bfh-handoff` (verify_jwt=false, HMAC-in-DB) and `webhook-worker`
  (verify_jwt=true) deployed ACTIVE to prod; `NOVAKORE_SITE_URL=https://www.novakore.io`
  set as an Edge Function secret; pg_cron jobs live: `novakore-webhook-worker`
  (`*/5 * * * *`, prod anon JWT, verified HTTP 200 responses) and
  `novakore-rate-limit-purge` (`7 * * * *`, from migration replay).
- §4 Vercel Production scope repointed: `NEXT_PUBLIC_SUPABASE_URL` /
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` → prod values, `NOVAKORE_PROD_REF=zttrpporfehrrabgbcrh`
  added (guard now fail-closed against dev in production). The old vars were
  Secret-type and Vercel forbids `NEXT_PUBLIC_*` secrets on edit, so they
  were deleted and recreated as Config-type (public client values).
  `NOVAKORE_ALLOW_DEV_DB` did not exist in Vercel — dropping it was a no-op.
  Production redeployed from `e1cab5c`: build exit 0 (env-check passed
  against the prod ref), `/api/health` → 200 `environment:"production"`,
  and prod REST logs show the health probe hitting `zttrpporfehrrabgbcrh`.

### Revert — same day (2026-09-07, owner decision)

The platform is not ready for production; owner directed cleanup/fix work
first and needs the live site serving dev data for it. Reverted §4 only:
Vercel Production `NEXT_PUBLIC_SUPABASE_URL`/`_ANON_KEY` back to the dev
values, `NOVAKORE_PROD_REF` deleted, production redeployed. Verified:
`/api/health` 200 and the probe landing in DEV project REST logs at
18:34 UTC. Everything else from the execution above stands: `novakore-prod`
remains provisioned, fully migrated, functions deployed, cron running,
Auth configured — re-pointing later is just §4 again (~10 min, proven).
Note: prod's `bfh-handoff` still has `NOVAKORE_SITE_URL=https://www.novakore.io`;
harmless while nothing points at prod.

**Remaining owner steps when the repoint is re-executed (gate §6 before go-live):**

1. Vercel Preview scope: add `NEXT_PUBLIC_SUPABASE_URL=https://mivqjcxpfanfzjkwwxcc.supabase.co`
   and the dev anon key (Preview scope only) — automation was blocked from
   entering dev values; previews had no scoped vars before either.
2. Owner account: Supabase dashboard (prod) → Auth → Users → Invite
   `jrpromero16@gmail.com`; complete the invite, then run on prod:
   `insert into public.platform_administrators (user_id, status)
 select id, 'active' from auth.users where lower(email) = 'jrpromero16@gmail.com'
 on conflict do nothing;`
3. Canary org via `provision_organization`, then suspend (per §6).
4. Backup restore drill onto a scratch project, timed + recorded (per §6).
5. Misconfiguration test: point a preview env at prod → build must fail;
   revert (per §6).
