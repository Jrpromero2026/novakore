# DEPLOYMENT_ARCHITECTURE

## Today (verified)

- **Web**: Vercel project `novakore`, git-connected to
  `github.com/Jrpromero2026/novakore` (push-to-deploy from `main`); the
  committed root `vercel.json` builds from the repo root (npm workspaces).
  Production serves `https://www.novakore.io`.
- **Data**: production serves from `novakore-dev` (`mivqjcxpfanfzjkwwxcc`)
  — the documented pre-production warn state (`scripts/env-check.mjs`
  warns loudly on every production build, fails closed on any unrecognised
  database, and refuses cross-wiring once `NOVAKORE_PROD_REF` is
  registered). The environment split WAS executed and verified on
  2026-09-07, then deliberately reverted the same day (owner decision:
  platform cleanup first; the live site is needed with dev data). The
  standing production project `novakore-prod` (`zttrpporfehrrabgbcrh`,
  us-west-1) remains fully migrated (66/66, history matches the repo),
  fixture-free, with functions deployed, cron running, and Auth configured
  — re-pointing is runbook §4 (~10 min, proven).
- **CI**: `.github/workflows/ci.yml` — format/lint/typecheck/unit/build on
  every push and PR; the real-DB suite runs when repo secrets exist (DEV
  project only, by policy). Branch protection on `main` is a one-time owner
  step (runbook).
- **Health**: `GET /api/health` — public, data-free (anon RPC probe under
  full RLS), verified live against prod.
- **Edge**: `bfh-handoff` + `webhook-worker` deployed ACTIVE on BOTH
  projects; on prod the outbox delivery runs via pg_cron
  (`novakore-webhook-worker`, every 5 min, verified HTTP 200) alongside
  `novakore-rate-limit-purge` (hourly). `bfh-handoff` on prod has
  `NOVAKORE_SITE_URL=https://www.novakore.io`.

## Production go-live (deferred by owner decision)

Re-point production per docs/operations/production-setup.md §4, then pass
the §6 verification gate (owner account via Auth invite + platform-admin
grant, canary org, backup restore drill, preview-misconfiguration test)
before onboarding paying organizations. Precondition: platform cleanup/fix
pass complete and owner-accepted.
