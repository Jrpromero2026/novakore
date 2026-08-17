# CTO Adversarial Engineering Review — Pre-Customer Gate

**Date:** 2026-08-01 · **Reviewer stance:** no ownership of prior decisions;
findings stated against the reviewer's own prior work where warranted.
**Audience:** investors, enterprise evaluators, future engineering leadership.
**Method:** evidence from the repository, the live database, the live
deployment, and two prior audits — re-examined without deference.

---

> **Remediation log (2026-08-01, after review):** **P0-1 CLOSED** —
> all 14 `@novakore.test` fixture accounts (including
> `platform.admin@novakore.test`) were rotated off the git-committed password
> on the live dev database; tests now read `NOVAKORE_TEST_PASSWORD` from the
> gitignored `.env.test.local` (bootstrap literal retained only for fresh
> local databases). Verified: 108/108 real-DB tests green with the new value,
> and the committed password is now **rejected** by the platform-admin
> account. The owner's personal account (`jrpromero16@gmail.com`) was then
> rotated too, via Supabase's own self-service `updateUser` flow — the new
> value went to the gitignored `.env.owner.local` and never surfaced in a
> log or transcript; the documented password is now rejected for it as well.
> **P0-1 is fully closed. Still open:** P0-2 (tests writing to the serving
> database), unchanged until the environment split.
>
> **Deploy guard corrected:** the Phase 6 `env-check` failed production
> builds for the _documented, accepted_ dev-database state — breaking
> deploys rather than preventing drift. It now warns loudly for the known
> dev project and fails closed only on an **unrecognised** database or a
> non-production → production cross-wire.

## Findings by area

### Security — the sharpest findings in the platform

- **[P0-1] Live credential exposure on the public deployment.** The
  production URL (novakore.vercel.app, public internet) authenticates
  against the dev database, which contains **15 password-bearing accounts
  whose shared password is committed to the git repository in plaintext**
  (`seed.sql`, quoted again in docs). These include the **owner account of
  every tenant** and — worst — **`platform.admin@novakore.test`, a
  platform administrator who can provision, suspend, and inspect every
  organization** via the operator RPCs shipped in Phase 6. Anyone with repo
  access (or any future leak of it) has standing admin access to the live
  site. Prior reports framed this as "env separation needed"; that framing
  was too kind. _Fix:_ before anything else — rotate/disable fixture
  passwords on any internet-reachable database, or take the deployment
  private. The env split alone does not retire this until dev is no longer
  the serving database.
- **[P0-2] The test suite writes to the serving database.** Every
  `npm run verify` signs in and mutates the same rows the public deployment
  serves. One misbehaving test away from a customer-visible incident.
- **[P0-3] The owner's personal account was provisioned with the same
  documented dev password.** Instructed to change it; **change never
  verified.** Until verified, assume the owner login of every tenant is
  public knowledge.
- **[P1] No rate limiting** on `/v1`, `bfh-handoff`, `/api/health`, or
  auth-adjacent routes. Key/HMAC auth bounds authorization, not volume.
- **[P1] No secret scanning or dependency CI gate**; the accepted `sharp`
  CVEs live inside a **forked framework that cannot take upstream security
  patches** (see Architecture).
- **[P2] Accessibility:** the documented light-mode status-color AA gap
  (known since Brand v1.0) remains unfixed — an enterprise procurement
  blocker in RFPs that demand WCAG conformance.
- Genuinely strong, verified: RLS isolation (119 policies / 97 live tests),
  in-DB HMAC verification, hashed API keys, no service-role key outside the
  owner's hands, security headers, fail-closed env validation.

### Architecture

- **[P1-4] The platform is built on a modified Next.js fork.** Every
  route, the lint rules, even dev-server behavior differ from upstream.
  Consequences: no upstream security patches (the sharp CVEs are already
  stuck), hiring friction, and a single point of ecosystem risk nobody
  prices in. This is the largest unexamined bet in the codebase, and no ADR
  documents why it exists or its exit strategy. _Fix:_ write the ADR; define
  the migration-to-upstream path or the fork-maintenance commitment.
- **[P2] God-file drift is beginning.** `lesson-editor.tsx` (~1,400 lines
  post-IDE), `nova.ts` (~14 queries + assembly), `admin/page.tsx` (insight
  derivation inline in a page component — duplicating engine logic that
  lives in `nova-insights.ts`; two sources of truth for "what Nova says").
  The Overview derives insights one way, `/intelligence` another. That is
  architectural drift, called out now while it is one page.
- **[P2] `lib/` vs `lib/data/` boundaries are convention, not enforcement**
  (`server-only` is used, but nothing prevents a pure module from growing
  I/O).
- Strong: package boundaries (domain/authorization/database/design-system),
  pure-core + data-shell pattern, contract-frozen integration boundary.

### Infrastructure & operational readiness

- **[P0-5] Change control does not exist in practice.** CI exists but has
  never run green (secrets unset, branch unprotected, first run triggered
  only hours ago), pushes deploy directly to the public URL, and — observed
  live during this review — **two agent sessions commit to `main`
  concurrently without coordination**: Phase 6 accidentally committed
  another session's WIP; that session has since continued building an
  entire onboarding feature (walkthrough engine, DB migration, Overview
  integration) on `main` with no review, no PR, and no green CI. For an
  internal lab this is velocity; for external customers it is how outages
  are manufactured. _Fix:_ branch protection + PRs + CI-required checks,
  today; one-writer-at-a-time discipline or worktree isolation for agents.
- **[P0-6] Disaster recovery is untested.** Restore has never been drilled;
  RPO/RTO are proposed, unratified. Rebuild-from-zero is verified; restore
  of customer data is **NOT VERIFIED** (correctly labeled, still open).
- **[P1] No error tracking, no alerting** — detection today is a human
  noticing. `/api/health` exists but nothing watches it.
- **[P1] Single environment** (acknowledged, scripted, still open).

### Multi-tenancy

- Isolation: best-proven property of the platform (live cross-tenant tests,
  API/storage checks). Personality: three genuinely divergent tenants.
- **[P1] Tenant lifecycle is one-third built:** provision/suspend/diagnose
  exist (gated, tested); **export and deletion do not** — both are
  contractual requirements for any enterprise customer (GDPR/CCPA data
  portability and erasure). No DPA story, no data-retention policy.
- **[P2] `suspended` has no enforced product meaning** — the runbook says
  "the app treats non-active orgs as read-limited," but no code path was
  found that actually gates on organization status at request time.
  Documentation and implementation disagree; the doc is aspirational.

### Performance & scalability

- **[P1-7] ~~The analytics read path is O(events)~~ — CLOSED (2026-08-01).**
  Counts, distinct learners, drop-off, the activity series, the digest
  windows and the weekday rhythm are now aggregated in Postgres
  (`org_event_metrics`, `org_event_daily_by_type`), analytics-gated inside
  the functions. The app receives pre-grouped rows instead of up to 5,000
  raw ones. This closed a **correctness** defect as well: past the old
  `limit()` the platform reported confidently wrong numbers. Equivalence to
  independently-counted ground truth is proven by 5 live-DB tests; the
  Command Center and Intelligence were re-verified end-to-end in a browser.
  **New finding while doing it:** the real-DB suite now exceeds Supabase's
  auth rate limit in a single full run (mass `beforeAll` failures that look
  like regressions but are not) — the CI job that runs it will be flaky
  until sessions are shared across files via a global setup. Raised as
  **[P2-TESTFLAKE]** — and **CLOSED the same day**: sessions are now pooled
  once per run by a vitest `globalSetup` and shared across files as bearer
  tokens, cutting sign-ins from ~35 to ~14. Three consecutive full runs pass
  113/113, where a second run previously collapsed. The CI gate is now
  trustworthy enough to enable. Original finding follows for the record:
- **[P1-7] The analytics read path is O(events) at request time** —
  2k–5k-row scans aggregated in JavaScript feed Ops, Nova, digest, and now
  the Hub. Remediation is well-planned (pure engines define contracts) but
  unstarted. Hard ceiling before any tenant with real traffic.
- **[P1] Zero pagination anywhere → CLOSED (2026-08-17).** Tested
  offset-pagination primitives (`lib/pagination.ts`, 11 unit tests, plus a
  server-safe `Pagination` control) now back all eight unbounded collections:
  issued credentials, Studio library, review queue, courses, members,
  enrollments, assessments, and ops feedback. Every row is addressable and
  each surface states its honest total. Learning paths are the one documented
  exception (no `limit()`, bounded cardinality, hierarchical rendering —
  reasoning in SCALABILITY_PLAN.md).

  Applying it surfaced a second-order bug worth recording: adding `.range()`
  silently converts every stat derived from the fetched array into a
  page-scoped number that still renders and is wrong. Two were caught and
  fixed here (`courses` published-count and onboarding signal, `members`
  other-member count); the failure mode is now written into the recipe.

  Verified end to end rather than assumed: an E2E spec signs in, follows the
  real link to page 2, and asserts the row set differs. That spec initially
  _skipped_ — the pager appeared absent — which turned out to be a bad
  `waitForURL` regex in the test racing the session, not a product defect.
  A silent skip is a failing test wearing a passing costume; the guard now
  asserts it reached `/admin/courses` before deciding anything.
  Original finding follows for the record:

- **[P1] Zero pagination anywhere.** Every list truncates silently at its
  `limit()` — a correctness bug wearing a performance costume (an operator
  cannot see item 201).
- **[P2] Per-request fan-out → LARGELY CLOSED (2026-08-17).** A bounded
  in-process TTL cache (`lib/cache.ts`) now fronts the two worst offenders.
  The palette fan-out was measured at **251ms p50 of round-trip on every
  navigation**, to populate a command palette most users never open; it is
  now cached per organization, and an A/B against the production build
  showed a light page fall from ~750ms to ~505ms median. The saving is
  smaller on heavy pages (courses: ~1090ms → ~1000ms) because there the
  palette was never the critical path — it overlapped the page's own
  queries. Nova is cached too, but per member.

  The interesting part is why those two are keyed differently. Sharing one
  palette entry across members is safe only because all four of its policies
  reduce to org-wide `content.view_draft` — verified against live RLS and
  pinned by a real-DB test across four distinct roles, so a future policy
  change fails the suite instead of leaking rows. Nova cannot be keyed that
  way: `enrollments`, `assessment_attempts`, and `organization_memberships`
  each read `<privileged permission> OR the row is mine`, so an org-wide
  entry would have served one member's rows to another. That was caught by
  reading the policies before writing the cache, not after.

  **Deliberately not done:** `use cache` / Cache Components. It cannot read
  `cookies()`, so adopting it would mean either an app-wide prerendering
  change on a forked framework or fetching without the session client — i.e.
  bypassing RLS. Reasoning recorded in SCALABILITY_PLAN.md. The Overview's 7
  data modules and per-lesson word-count scans remain uncached.
  Original finding follows for the record:

- **[P2] Per-request fan-out**: admin layout runs 4 palette queries per
  navigation; the Overview runs 7 data modules; Nova ~14 queries; no
  caching layer of any kind. Fine at 3 tenants; compounding tax later.
- No load test has ever been executed. All latency claims derive from a
  single-user environment. **NOT VERIFIED at concurrency.**

### Data integrity

- Strong by design: immutable versions, pinned enrollments, idempotency
  keys on events/API calls, transactional outbox, deterministic seeds,
  audit logging on sensitive RPCs — and the Phase 6 episode (live-DB tests
  catching wrong audit columns before merge) shows the safety net works
  where tests exist.
- **[P1] The audit-vocabulary defect class is systemic**: RPC authors have
  now twice guessed schema shapes (audit columns, action format). There is
  no schema-level test enumerating audit_logs writers, and no CI-enforced
  types-drift gate (the CI step warns instead of failing). _Fix:_ make
  types-drift a hard failure; add an audit-action catalog test.
- **[P2] `settings` jsonb is now load-bearing** (identity) with
  application-side validation only; a bad writer can silently clobber
  sibling keys (the merge-write in the action mitigates but nothing
  enforces shape at the DB).

### AI governance

- The governance frame (budget caps, validation, human gate, audit) is
  ahead of the industry — and currently governs a **mock provider**.
  **[P2] "AI-first platform" is a roadmap claim today**: no live provider,
  no semantic search, no generation in production. Honestly labeled
  internally; a diligence process will still ask why the flagship
  differentiator is simulated. The grounded-insight engine (Nova) is real
  and defensible; keep the distinction crisp in external claims.

### Testing quality

- 358 tests with a rare asset: 97 against live RLS. Pure-engine coverage is
  exemplary.
- **[P1-8] ~~Zero end-to-end tests~~ — PARTIALLY CLOSED (2026-08-01).** A
  Playwright happy path now runs in a real browser against the real database
  (`npm run test:e2e`, wired into CI, secret-gated, read-only by design):
  anonymous refusal → sign-in → Command Center → Studio knowledge graph →
  Knowledge IDE → Intelligence → learner Academy → public credential
  verification. 3/3 green locally; it caught nothing on first run, which is
  itself the evidence those surfaces compose. **Still open:** visual
  regression (rendering ≠ looking right) and mutating flows (author →
  publish), which stay out until the environment split so tests never write
  to the serving database. Original finding follows for the record:
- **[P1-8] Zero end-to-end tests and zero visual regression.** Six phases
  of UI have shipped with **no human visual acceptance and no automated
  browser flow** — sign-in→admin→publish→learn has never been executed by
  anything but code review since the alpha gate. This is the largest
  quality blind spot.
- **[P2] Real-DB tests are coupled to shared mutable fixtures** (documented
  gotchas: "keep alpha.learner's course incomplete", auth rate-limit
  flakes, QA churn in the same tables). Works now; will not survive a team.
- **[P2] The web suite tests components, not routes** — no test would catch
  a broken page composition (e.g., the foreign onboarding integration now
  sitting in the Overview page was never covered by any test I can see).

### Documentation, DX, maintainability

- Documentation is a genuine strength: 27 ADRs, as-builts, vision docs,
  runbooks, honest NOT-VERIFIED labeling. Two drifts found: the suspension
  claim (above) and static counts (policies/tests) already going stale in
  multiple docs — prefer generated evidence over hand-written numbers.
- **[P2] The "module recipe" lives in convention and agent memory**, not in
  tooling or CONTRIBUTING.md. Bus factor on the conventions is effectively
  one person plus one AI's memory files.

### Commercial readiness

- **[P0]** Everything above; plus: no billing, no ToS/privacy/DPA, no
  support SLA, no status page, no customer-facing incident comms path.
  These are business items, but engineering blocks on none of them — and
  onboarding revenue without them is liability, not traction.

---

## 1 · Executive summary

NovaKore is an unusually disciplined single-builder platform: proven tenant
isolation, immutable content governance, an honest intelligence layer, and
documentation most seed-stage teams never write. It is also a platform
whose public deployment currently accepts a git-committed password for
every tenant owner and a platform administrator, whose test suite writes to
the serving database, whose framework is an unpatchable fork, and whose
`main` branch is being written to concurrently by multiple agents with no
enforced gate. The distance between those two sentences is the work. Most
of it is scripted, short, and operational rather than architectural — but
none of it is optional.

## 2 · Platform health score: **64 / 100**

Correctness and design ~85; operations, recovery, and change control ~40;
weighted toward what external customers experience. (Prior internal audits
graded generously by area; this number prices the P0s.)

## 3 · Technical debt assessment

Deliberate, documented, and mostly honest — the best kind. Material items:
event-scan analytics, zero pagination, fork dependency, god-file drift,
duplicated insight derivation, fixture-coupled tests, jsonb-borne identity.
Nothing rotten; several items compounding. Debt register quality: high
(SCALABILITY_PLAN, exit criteria). Repayment discipline: untested.

## 4 · Operational risk assessment

**High.** Single human operator; no alerting; unverified restore; shared
dev/prod; concurrent unreviewed writes to main; detection = luck. The
runbooks are good enough that a second engineer could operate the platform
— but no second engineer has ever tried, and no incident has ever tested
the paper.

## 5 · Commercial readiness assessment

**Not ready for paying organizations** (the platform's own env-check now
enforces part of this). Ready for: continued internal alpha, design
partners on explicit no-SLA terms _after_ P0-1/2/3 are closed. The gap to
"first paying customer" is roughly: credential rotation + env split +
restore drill + CI enforcement + one E2E pass + export/delete tooling —
weeks of focused work, not months.

## 6 · Top 10 engineering priorities

1. **Rotate/retire every fixture credential reachable from the public URL;
   verify the owner's personal password changed** (P0-1/3, hours).
2. **Flip change control on**: repo secrets, branch protection, PR-only
   main, CI-required checks; one-writer discipline for agent sessions (P0-5).
3. **Execute the environment split** (production-setup.md, P0).
4. **Backup restore drill with timed evidence** (P0-6).
5. **One automated E2E happy path** (sign-in → author → publish → learn →
   verify) run in CI against a disposable context (P1-8).
6. **Analytics rollups + pagination**, behind the existing pure-engine
   contracts (P1-7).
7. **Fork ADR + exit strategy** for the modified Next.js (P1-4).
8. **Tenant export + deletion tooling** (enterprise/GDPR gate, P1).
9. **Error tracking + health alerting** (owner decision pending, P1).
10. **De-duplicate insight derivation** (Overview vs engine) and split the
    god files before they calcify (P2, cheap now).

## 7 · Go / No-Go

- Internal alpha, current testers: **GO.**
- Design partners (no SLA, informed consent): **GO after items 1–2.**
- Paying external organizations: **NO-GO** until items 1–5 complete and
  the V1 exit criteria show no ❌ in Delivery safety, Environments, or
  Data operations. This is 2–4 focused weeks, not a rebuild.

## 8 · What would concern a Series A technical diligence

The fork (unpatchable framework at the foundation); bus factor = 1 human +
AI-session memory; zero E2E/visual coverage across six UI phases; "AI-first"
running on a mock provider; the committed-password history; no load
evidence; and that every audit so far was produced by the same agent that
built the system — including this one. They would fund the architecture and
condition on the operations.

## 9 · What would concern an enterprise CTO

Data residency/DPA/retention absent; no export or erasure tooling; WCAG
gap; SSO limited to the BFH contract (no SAML/OIDC for their workforce);
no status page, SLA, or pen test; single-region, single-operator. The RLS
test suite and the audit trail would impress them; procurement would still
say no today.

## 10 · Single greatest engineering strength

**Verified honesty as architecture.** The platform refuses to claim what it
cannot prove — in its UI (grounded Nova), its tests (97 live-RLS proofs),
its documents (NOT VERIFIED labels), and now its build system (fail-closed
env checks). That property compounds: every future feature inherits a
culture where claims are cheap to audit. Competitors cannot copy this with
a sprint.

## 11 · Single greatest engineering weakness

**Operations lag architecture by two maturity levels.** World-class
correctness discipline sits on top of: shared dev/prod, committed
credentials on a public URL, no enforced CI, no tested recovery, no second
operator. The platform is trustworthy by construction and unprotected by
operation — and customers experience the operation.
