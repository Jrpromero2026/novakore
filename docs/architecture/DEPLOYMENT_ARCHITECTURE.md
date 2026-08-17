# DEPLOYMENT_ARCHITECTURE

## Today (verified)

- **Web**: Vercel project `novakore`, git-connected to
  `github.com/Jrpromero2026/novakore` (push-to-deploy from `main`); the
  committed root `vercel.json` builds from the repo root (npm workspaces).
- **Data**: Supabase project `novakore-dev` (mivqjcxpfanfzjkwwxcc) — serving
  BOTH development and the deployed app. This is the documented
  pre-production state: `scripts/env-check.mjs` (apps/web `prebuild`) prints
  a loud warning on every production build, fails closed on any
  **unrecognised** database, and refuses cross-wiring (non-prod → prod) once
  `NOVAKORE_PROD_REF` is registered.
- **CI**: `.github/workflows/ci.yml` — format/lint/typecheck/unit/build on
  every push and PR; the real-DB suite runs when repo secrets exist. Branch
  protection on `main` is a one-time owner step (runbook).
- **Health**: `GET /api/health` — public, data-free (anon RPC probe under
  full RLS), verified live.
- **Edge**: `bfh-handoff` + `webhook-worker` ACTIVE; outbox delivery
  scheduled via pg_cron.

## Target (documented, not yet executed)

A separate `novakore-prod` Supabase project + Vercel environment split —
the full runbook is docs/operations/production-setup.md. Secrets are
per-environment, never committed; rotation procedures live in the
operations runbook.
