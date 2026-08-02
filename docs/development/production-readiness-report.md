# Production Readiness Report (Phase 6 — v1.0 Exit Gate)

**Date:** 2026-08-01 · **Scope:** everything on `main` through Phase 6
**Standard:** nothing below is claimed without evidence. Where a criterion
could not be verified, it says **NOT VERIFIED** — unknowns are acceptable,
false confidence is not.

## What Phase 6 shipped (all evidence-backed)

| Priority         | Delivered                                                                                                                                                                                                                                                | Evidence                                                                                                               |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| P1 Environments  | Fail-closed validation (`scripts/env-check.mjs`, wired as `prebuild`); prod-setup runbook ready-to-execute; owner decision recorded: prepare now, create `novakore-prod` before first paying org                                                         | Script fails production builds pointing at unregistered DBs; docs/operations/production-setup.md                       |
| P2 CI/CD         | `.github/workflows/ci.yml` mirroring the full verify gate; real-DB job secret-gated; branch-protection steps documented                                                                                                                                  | Workflow committed; first run triggers on this push                                                                    |
| P3 DB ops        | All 36 migrations reviewed: forward-only, remote/local parity confirmed via `list_migrations`; MCP-first workflow + promotion path documented; destructive-migration policy set                                                                          | Runbook §Migration process; only intentional `drop function` statements exist (overload cleanup, function replacement) |
| P4 Backups       | Procedure + objectives documented; **restore drill NOT VERIFIED** (requires the prod/scratch project — gate item in production-setup §6)                                                                                                                 | runbook §Backups                                                                                                       |
| P5 Observability | `/api/health` (public, data-free, anon-RPC probe) **verified live: HTTP 200, db 146ms**; error tracking = documented owner choice (deliberately not integrated)                                                                                          | Live curl evidence; runbook §Incident response                                                                         |
| P6 Security      | Full review below; security headers **verified live**; advisor triage complete; npm audit triaged                                                                                                                                                        | This report §Security                                                                                                  |
| P7 Performance   | Unscoped queries org-filtered (nova ×3, library ×1, hub ×1); full remediation plan with sequencing in SCALABILITY_PLAN.md                                                                                                                                | Diffs in this commit                                                                                                   |
| P8 Tenant ops    | `set_organization_status` + `tenant_diagnostics` (new, platform-admin-gated, audited); discovered `provision_organization` has existed since Phase 1A (the maturity audit missed it — corrected); redundant overload dropped; **3 live-DB gating tests** | Migrations 20260802034047…035041; platform-ops.test.ts green                                                           |
| P9 Docs          | Operations runbook, production-setup runbook, onboarding, release checklist; 9 architecture vision docs + V1_EXIT_CRITERIA                                                                                                                               | docs/operations/, docs/architecture/                                                                                   |
| P10 Exit gate    | Executable, honest checklist                                                                                                                                                                                                                             | docs/architecture/V1_EXIT_CRITERIA.md                                                                                  |

## Security review (findings + disposition)

**Verified sound:** RLS isolation (119 policies, 97 live-DB tests incl. new
platform-ops gating); secrets posture (service-role key never in repo/CI/
Vercel; HMAC secret never leaves Postgres; hashed API keys); webhook
signing + replay protection (constant-time compare, timestamp window,
eventId dedupe — live-tested in the alpha phase); session handling via
@supabase/ssr with `shouldCreateUser:false`; security headers now on every
response (nosniff, DENY framing, referrer policy, HSTS, permissions policy
— verified live).

**Advisor triage (Supabase security lints):** 0 errors. 40 warnings =
SECURITY DEFINER functions callable by `authenticated`/`anon` — this is the
platform's deliberate architecture: every such function re-checks
permissions internally (deny-by-default), which the live-DB suite proves.
7 infos = `app.*` tables with RLS enabled and no policies — intentional
(service-role-only tables; no API exposure). **Accepted by design.**

**Dependency audit:** 2 high — `sharp < 0.35.0` (libvips CVEs) bundled
inside the modified Next.js fork. The only automated fix downgrades Next to
14.x, destroying the platform. Exposure assessment: sharp runs server-side
for image optimization of platform-controlled assets; no untrusted image
processing path exists in the request flow. **Accepted risk, time-boxed:**
re-evaluate on every fork update; revisit if user-uploaded image rendering
is ever routed through next/image.

**Open (honest):** no rate limiting on `/v1` or `bfh-handoff` (auth is
per-org key/HMAC; brute-force cost is bounded by hashing + nonce windows,
but volumetric abuse is unmitigated) — accepted short-term, listed in exit
criteria. No error-tracking service (owner choice pending). Dev-only
placeholder credentials exist in git history (private repo; rotation path
documented).

**Fixed during this phase:** operator-tooling audit-log defect
(`set_organization_status` wrote to non-existent columns, then an invalid
action format) — caught by the new live-DB tests before reaching `main`;
two corrective migrations applied. This is the CI thesis proven in
miniature.

## Performance audit

Measured reality: at current scale (1.7k events, 95 blocks, 3 tenants) all
surfaces render fast; the health probe puts DB round-trip at ~146ms from
local. The structural risks (event-scan analytics, no pagination, palette
fan-out, uncached Nova) are unchanged from the maturity audit and now have
a sequenced, contract-preserving remediation plan (SCALABILITY_PLAN.md).
Quick wins landed: five queries org-scoped to use tenant indexes instead of
RLS-only filtering. **Rollups and pagination remain OPEN** — required
before any tenant with >10k events.

## Remaining risks (ranked)

1. **P1-ENV** — production serves from the dev database (explicitly
   acknowledged via NOVAKORE_ALLOW_DEV_DB; fail-closed guard in place).
   Close by executing production-setup.md. **Blocks paying customers.**
2. **P1-RESTORE** — backup restoration never drilled. NOT VERIFIED.
3. **P2-CI-ADOPTION** — pipeline exists but branch protection + secrets are
   owner steps; until then a local push can still bypass the gate.
4. **P2-SCALE** — analytics read path fails at growth (plan exists).
5. **P2-VISUAL** — zero human visual acceptance of Phases 1–6.
6. **P3-RATE/MONITOR** — rate limiting + error tracking absent.
7. **P3-SHARP** — accepted CVE exposure in the framework fork.

## Go / No-Go

**Internal alpha (current testers, dev tenant): GO** — unchanged, and
stronger than at the alpha gate (CI, health, headers, operator tooling).

**Onboarding paying organizations: NO-GO** — and the platform now says so
itself: env-check will not even build a production deployment against an
unregistered database without an explicit acknowledgment flag. The distance
to GO is short and fully scripted: execute production-setup.md (§1–6,
~45 min + restore drill), flip the two CI owner switches, and complete one
customer-#2 rehearsal. Those three items — not code — are the v1.0 gate.

## The six questions

| Question                            | Answer                                                                       |
| ----------------------------------- | ---------------------------------------------------------------------------- |
| Confidently onboard paying orgs?    | **Not yet** — env split + restore drill first (both scripted)                |
| Can another engineer deploy safely? | **Yes** — runbook + CI + fail-closed checks + health verification            |
| Can I recover from disaster?        | **Partially** — rebuild-from-zero verified; restore-from-backup NOT VERIFIED |
| Can I trust deployments?            | **Yes, with the two owner switches** (secrets + branch protection)           |
| Can I scale beyond one customer?    | **Data layer yes (proven ×3 tenants); read paths after rollups**             |
| Sleep after pressing Deploy?        | **Dev/alpha: yes. Production money: after the drill.**                       |
