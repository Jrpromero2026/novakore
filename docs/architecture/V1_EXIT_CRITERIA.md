# V1_EXIT_CRITERIA

The measurable gate between "exceptional application" and "commercial
platform". Status is evidence-based as of 2026-08-01 (`main`, Phase 6):
✅ verified · 🟡 ready-not-executed · ❌ open. Never mark ✅ without evidence.

## Quality

- [x] ✅ Full verify suite green (format/lint/typecheck; 358 tests incl.
      97 real-DB under live RLS; production build exit 0).
- [x] ✅ Design-system parity + a11y contract tests green (16).
- [x] ✅ Automated browser coverage of the happy path (`npm run test:e2e`,
      3 specs, real browser + real database, read-only): anonymous refusal,
      sign-in, Command Center, Studio knowledge graph, Knowledge IDE
      inspector, Intelligence, learner Academy, public verification.
- [ ] ❌ Owner visual acceptance of Phases 1–6 surfaces (never performed —
      E2E proves the surfaces _render_, not that they look right).
- [ ] ❌ Standard-browser alpha regression checklist + screenshots (owner).

## Delivery safety

- [x] ✅ CI pipeline exists (.github/workflows/ci.yml) and mirrors verify.
- [ ] 🟡 CI observed green on GitHub (first run happens on next push).
- [ ] 🟡 Repo secrets for the real-DB CI job (owner, 2 secrets).
- [ ] 🟡 Branch protection on `main` requiring the verify check (owner).

## Environments

- [x] ✅ Fail-closed env validation in every production build
      (scripts/env-check.mjs; refuses unregistered DBs).
- [x] ✅ `novakore-prod` Supabase project created + all 66 migrations applied
      (history matches repo 1:1; 132 policies; 0 users / 0 orgs —
      fixture-free). Executed 2026-09-07; evidence in
      docs/operations/production-setup.md §Execution record.
- [x] ✅ Vercel production env pointed at prod. Executed 2026-09-07,
      reverted same day (owner: cleanup first), **re-executed 2026-09-08
      after the cleanup pass** to close CTO-review P0-2: env vars +
      `NOVAKORE_PROD_REF` restored, redeploy `dpl_9673u8JjE…` built with
      `✓ env-check passed (production → zttrpporfehrrabgbcrh)`, `/api/health`
      200, prod REST logs show the probe. Tests stay on dev, which no longer
      serves anything public (P0-2 closed). Prod has zero users until the
      §6 owner steps (invite + platform admin). **Do not onboard paying
      organizations until §6 passes.**

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
- [ ] 🟡 `sharp` CVEs in the pinned Next.js: accepted risk, reviewed on
      every deliberate version bump (ADR-028 — the framework is
      exactly-pinned upstream, not a fork).

## Commercial readiness

- [x] ✅ Customer-2-without-custom-code proven at the data layer (three
      divergent tenants live; provisioning RPC since Phase 1A).
- [ ] ❌ Customer #2 end-to-end deploy rehearsal (provision → brand →
      terminology → content → learner) executed with evidence.
- [ ] ❌ Scalability plan step 1 (analytics rollups) implemented.
- [ ] 🟡 No known P1s: P1-ENV (shared dev/prod DB) — repoint re-executed
      2026-09-08; production serves `novakore-prod`, tests/dev traffic
      stay on `novakore-dev` (P0-2 closed). Remaining before P1-ENV can be
      marked ✅: the §6 gate owner steps (owner account, canary org,
      restore drill, preview-misconfig test).

**Exit rule:** all ❌ closed and all 🟡 executed → v1.0. Anything less ships
as "internal alpha" only.
