# V1_EXIT_CRITERIA

The measurable gate between "exceptional application" and "commercial
platform". Status is evidence-based as of 2026-08-01 (`main`, Phase 6):
✅ verified · 🟡 ready-not-executed · ❌ open. Never mark ✅ without evidence.

## Quality

- [x] ✅ Full verify suite green (format/lint/typecheck; 358 tests incl.
      97 real-DB under live RLS; production build exit 0).
- [x] ✅ Design-system parity + a11y contract tests green (16).
- [ ] ❌ Owner visual acceptance of Phases 1–6 surfaces (never performed).
- [ ] ❌ Standard-browser alpha regression checklist + screenshots (owner).

## Delivery safety

- [x] ✅ CI pipeline exists (.github/workflows/ci.yml) and mirrors verify.
- [ ] 🟡 CI observed green on GitHub (first run happens on next push).
- [ ] 🟡 Repo secrets for the real-DB CI job (owner, 2 secrets).
- [ ] 🟡 Branch protection on `main` requiring the verify check (owner).

## Environments

- [x] ✅ Fail-closed env validation in every production build
      (scripts/env-check.mjs; refuses unregistered DBs).
- [ ] 🟡 `novakore-prod` Supabase project created + migrations applied +
      fixture-free seed (runbook ready: docs/operations/production-setup.md).
- [ ] 🟡 Vercel production env pointed at prod; `NOVAKORE_ALLOW_DEV_DB`
      removed. Until then: **do not onboard paying organizations.**

## Data operations

- [x] ✅ Migration history forward-only, mirrored, and in sync with the
      remote (36 migrations; drift caught by generated-types check).
- [x] ✅ Deterministic idempotent seed reproduces the platform + alpha.
- [ ] ❌ Backup restore drill executed with evidence (requires prod project;
      procedure documented — NOT VERIFIED).

## Observability & security

- [x] ✅ Health endpoint live (`/api/health`, data-free, 200/503).
- [x] ✅ Security headers on every response (verified live).
- [x] ✅ Security advisor findings triaged (0 errors; warnings are the
      documented SECURITY-DEFINER-with-internal-checks pattern).
- [x] ✅ Platform operator tooling gated + live-tested (provision /
      suspend / diagnostics; 42501 & forbidden proven by tests).
- [ ] ❌ Error tracking integrated (documented owner choice; not wired).
- [ ] ❌ Rate limiting on `/v1` + handoff (accepted risk, time-boxed).
- [ ] 🟡 `sharp` CVEs in the modified Next fork: accepted risk, review on
      every Next fork update (fix would downgrade the framework).

## Commercial readiness

- [x] ✅ Customer-2-without-custom-code proven at the data layer (three
      divergent tenants live; provisioning RPC since Phase 1A).
- [ ] ❌ Customer #2 end-to-end deploy rehearsal (provision → brand →
      terminology → content → learner) executed with evidence.
- [ ] ❌ Scalability plan step 1 (analytics rollups) implemented.
- [ ] ❌ No known P1s: P1-ENV (shared dev/prod DB) remains open until the
      environment split executes.

**Exit rule:** all ❌ closed and all 🟡 executed → v1.0. Anything less ships
as "internal alpha" only.
