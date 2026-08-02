# NovaKore Platform Maturity Audit

**Date:** 2026-08-01 · **Scope:** the platform as of `e64859b` (Phase 5)
**Method:** every claim below is grounded in the repository, the schema, or
the live dev system (`novakore-dev`) — the same honesty rule the product
itself follows. Where the platform is weak, this audit says so plainly.

## Evidence base

| Measure                    | Value                                                                           |
| -------------------------- | ------------------------------------------------------------------------------- |
| Application + package code | ~41,400 lines (154 web source files, 4 workspace packages, 2 Edge Functions)    |
| Migrations / schema        | 32 migrations · 49 `public` + 6 `app` tables · 39 `app` functions               |
| Row-level security         | **119 RLS policies**, proven by **94 real-database tests** run against live RLS |
| Automated tests            | **355** (99 web · 9 authz · 94 real-DB · 16 design-parity · 137 domain)         |
| Governance artifacts       | 27 ADRs · 74 docs · a parity-tested design system                               |
| Permission catalog         | 32 permissions, deny-by-default, role-bundled                                   |
| Live tenants               | 3 coexisting orgs on one deployment (see Multi-tenancy)                         |
| CI pipelines               | **None** (`.github/workflows` does not exist)                                   |
| Pagination in app queries  | **None** (`.range()` used 0 times)                                              |
| Rate limiting              | **None** (0 references in `/v1` or Edge Functions)                              |

---

## 1 · Product Identity — **Strong (A−)**

**Does NovaKore have capabilities no mainstream LMS offers?** Yes — and the
differentiators share one root: _grounded intelligence over governed
knowledge_.

- **The honesty architecture.** Every metric, insight, and score is derived
  from real records (`nova-insights.ts` is a pure, unit-tested engine; the
  scorecard renders an em dash when there is no basis). Mainstream LMS
  dashboards decorate; NovaKore's refuse to lie. This is a _cultural_
  capability — hard to bolt on later.
- **Knowledge IDE** (three-panel authoring, slash commands, Knowledge Health
  coaching with 10 derived signals, publish-as-ceremony over immutable
  versions) — authoring as creative tooling, not form-filling.
- **Knowledge Graph + curriculum analysis** — cycles, broken pathways,
  isolated knowledge, terminology drift — computed from relational truth.
- **Terminology engine** as identity: BFH genuinely operates in
  Journey/Program/Phase/Evaluation/Coach/Member across every surface, and
  Nova polices drift between prose and vocabulary.
- **Contract-driven integration boundary** (ADR-012/018): SSO handoff
  verified in-database, idempotent `/v1`, signed outbox webhooks, explicit
  privacy boundary. This is enterprise-integration posture, not LMS plugins.

**Gap:** the AI layer is governed but _mock/deterministic_ — Nova observes
brilliantly but does not yet generate with a live provider. Semantic search
absent (honestly labeled). Identity is real; the "AI-first" claim is only
half-earned until a live provider is switched on.

## 2 · Platform Architecture — **Good bones, missing operations (B)**

**Could a second customer launch without custom code?** _Almost._ The
platform code is genuinely generic — nothing in the app hard-codes BFH.
Launching "Customer 2" requires only rows: an organization, system roles
(`app.create_system_roles`), branding, optional terminology, content. The
BFH integration itself is org-scoped configuration (per-org secrets, per-org
API keys), not code.

**But the launch path is manual.** There is no self-serve or operator
tooling for org creation (the only org-level function is slug protection);
new tenants are seeded by hand. Acceptable pre-revenue; not a platform yet.

**Operational gaps that now bind:**

- **No CI.** The verify suite is excellent and disciplined — and runs only
  on a developer's machine. A push to `main` deploys without a gate.
- **One Supabase project.** Dev, QA, and the deployed app share
  `novakore-dev`. There is no production project, no staging, no backup /
  restore posture, no migration-promotion pipeline.
- No error monitoring, no rate limiting on public endpoints (`/v1`,
  `bfh-handoff` rely on key/HMAC auth alone), no request logging strategy.

## 3 · Multi-Tenancy — **Strong isolation, proven personality (A−)**

Three organizations coexist on the live system today, and they genuinely
diverge: **bfh-dev** (published berry theme, 7 terminology overrides, curated
7-course/36-lesson curriculum), **alpha-learning** (published indigo theme,
canonical vocabulary, 83 courses of test churn, 1,634 events),
**gamma-research** (deliberate fallback-branding fixture). Same binary,
three different-feeling workspaces — the Phase 5 identity layer, pins, and
terminology make "owner, not tenant" real.

Isolation is the platform's best-proven property: 119 RLS policies exercised
by 94 permanent tests against the live database, including cross-tenant API
and storage checks. The `app` schema (secrets, nonces, idempotency) is
never PostgREST-exposed; the handoff secret never leaves Postgres.

**Gaps:** tenant _feel_ is strong; tenant _lifecycle_ is absent (no
onboarding, suspension, export, or deletion flows). Identity (mission/values)
exists but no tenant has populated it yet — adoption unproven.

## 4 · Developer Experience — **The quiet strength (A−)**

**How easy is a new module that inherits everything?** Genuinely easy, and
Phase 4–5 proved it twice: the Intelligence surface and the Organization Hub
were each added in one pass and inherited design (tokens + primitives),
permissions (`can()` + `needsAny`), navigation + command palette
(`nav-config.ts` is the single source), terminology (`term()`), branding
(CSS variables), and intelligence (the pure engine takes new inputs without
schema work). The recipe is documented by example: data module → page built
from `Panel`/`SectionHeader`/widgets → nav entry → tests.

Supporting discipline: 27 ADRs, a governed design-language doc, generated DB
types that catch schema drift at typecheck, deterministic idempotent seeds,
and a 355-test gate.

**Gaps:** no CI to enforce the gate; no scaffold/codegen for the module
recipe (it lives in convention + memory); real-DB tests require the shared
dev project (no local stack — Docker absent by constraint); visual
regression is entirely manual owner work.

## 5 · Scalability — **The honest weak spot (C+)**

**Would this make sense at 100 orgs / 1M learners?** The _schema_ would; the
_read paths_ would not.

- **Event-scan analytics.** Ops, Nova, and the digest fetch up to 2k–5k raw
  `analytics_events` rows per render and aggregate in JavaScript. At 1,661
  events this is instant; at millions it fails. These derivations belong in
  SQL aggregates / materialized rollups — the _derivation logic is already
  pure and tested_, so the migration is mechanical, but it must happen.
- **No pagination anywhere.** Admin lists cap with `limit()` and truncate
  silently. Fine at 36 lessons; wrong at 10,000.
- **Layout-level fan-out.** The admin layout now runs 4 title queries per
  navigation for palette search; the Nova report runs ~14 queries per view
  with no caching (`unstable_cache`/ISR unused). Cheap now, compounding later.
- **Unscoped-by-column queries.** A few reads (e.g. `content_blocks` for
  Nova/lesson words) rely on RLS alone rather than org-filtered indexes.
- What _does_ scale: UUID-keyed multi-tenant schema, indexed hot paths
  (events by org+type, blocks by lesson), the outbox pattern, immutable
  versions, permission resolution, and Postgres itself.

**Verdict:** correct-by-construction, not yet scaled-by-construction. The
honest framing: every scaling fix is a _rewrite of plumbing under tested
logic_, not a redesign — the pure engines are the insurance policy.

## 6 · Competitive Moat — **Real, if compounded (B+)**

**What would take a competitor years, not months?**

1. **The honesty culture as architecture.** Grounded-only intelligence,
   documented known-gaps, tested claims — this is organizational behavior
   encoded in code review, tests, and docs. Competitors can copy a scorecard;
   copying the discipline that makes it trustworthy is the slow part.
2. **Governance depth**: immutable versioning + review workflow +
   deny-by-default permissions + auditable RPCs + RLS proven against a live
   database. Years of correctness work for a fast-follower.
3. **The terminology/identity engine** woven through every surface (and now
   watched by Nova) — retrofitting vocabulary neutrality into an existing
   LMS is a full rewrite.
4. **The integration contract posture** (in-DB signature verification,
   idempotency, privacy boundary as spec) — most LMS integrations are
   webhooks and hope.

**What is _not_ yet moat:** the visual polish (reproducible), the mock AI
(no data flywheel yet), and category positioning ("Knowledge IDE",
"organizational OS") — the concepts are strong but only defensible once a
second, unrelated customer proves them.

---

## Scorecard

| Area                  | Grade | One line                                                            |
| --------------------- | ----- | ------------------------------------------------------------------- |
| Product identity      | A−    | Differentiated where it matters; AI half-armed (mock provider).     |
| Platform architecture | B     | Generic core, manual tenant launch, **no CI / single environment**. |
| Multi-tenancy         | A−    | Isolation proven live; lifecycle tooling absent.                    |
| Developer experience  | A−    | New modules inherit everything; recipe is convention, not tooling.  |
| Scalability           | C+    | Event-scan analytics + zero pagination will not survive growth.     |
| Competitive moat      | B+    | Governance + honesty are real moats; need customer #2 to compound.  |

## Ranked next investments (highest leverage first)

1. **CI gate + environment split** — GitHub Actions running the verify suite
   on every push; a separate production Supabase project with a
   migration-promotion path. _Everything else is unsafe to scale without
   this._
2. **Aggregate the analytics read path** — move ops/Nova/digest derivations
   into SQL views or scheduled rollups (the pure engines define the exact
   contracts to preserve). Add pagination to every admin collection.
3. **Owner visual pass + alpha completion** — the standing gap: no human has
   visually accepted Phases 1–5; the internal alpha checklist still awaits
   its screenshots. Ship nothing further until eyes confirm pixels.
4. **Live AI provider behind the existing governance** — the budget caps,
   validation gates, and review workflow were built for this; switching
   `NOVAKORE_AI_PROVIDER=anthropic` turns Nova from observer to author and
   starts the moat flywheel (then: semantic search, honestly).
5. **Tenant lifecycle tooling** — platform-admin org creation (wrapping
   `create_system_roles` + branding defaults), suspension, export. This is
   what makes "second customer without custom code" true in practice.
6. **Operational hardening** — rate limiting on `/v1` + handoff, error
   monitoring, request logging, backup/restore drill.

## Bottom line

NovaKore is past the "application" threshold: three tenants live on one
generic codebase, new modules inherit the whole platform by convention, and
its two rarest assets — proven isolation and enforced honesty — are exactly
the ones competitors can't copy quickly. The binding constraints are now
operational, not conceptual: **no CI, one environment, and read paths that
don't scale**. The next phase of work should be invisible in screenshots —
and it's the phase that decides whether this becomes a platform.
