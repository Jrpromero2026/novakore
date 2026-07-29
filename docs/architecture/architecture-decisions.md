# Architecture Decision Records

Format: context → decision → consequences. Status: **Accepted** unless
marked. Amending a decision requires a new ADR superseding the old.

---

## ADR-001 — Separate NovaKore repository

**Context.** NovaKore could have grown inside an existing product repo
(e.g. Built For Her). BFH is the first tenant, and first tenants exert
gravitational pull on architecture.

**Decision.** NovaKore lives in its own repository with no code-level
dependency on any BFH repository, in either direction.

**Consequences.** Coupling is only possible through the versioned public
contract ([built-for-her-integration.md](built-for-her-integration.md));
contamination becomes structurally difficult; some duplication (auth
patterns, UI primitives) is accepted as the price of reusability.

---

## ADR-002 — npm workspaces (no pnpm/Turborepo yet)

**Context.** Monorepo tooling choices multiply. Node 22 + npm 10 are
installed; the repo has one app and small packages.

**Decision.** npm workspaces, hoisted installs, single lockfile. Revisit
only when build-graph pain is real (many packages, long CI).

**Consequences.** Zero extra tooling; slightly weaker task orchestration
(acceptable at this scale); migration to pnpm/Turbo remains mechanical
later.

---

## ADR-003 — Canonical entities + configurable terminology overlay

**Context.** Tenants demand their own vocabulary (Journey, Program, Coach,
Member). Renaming entities per tenant in code/schema would be catastrophic.

**Decision.** Entity names in code, database, APIs, and events are frozen
canonical identifiers. Display terminology is data:
`terminology_overrides(term_key, singular, plural, short)` per organization,
resolved org-override → platform default, cached per org.

**Consequences.** All UI copy referencing entities goes through the
terminology resolver from day one (enforced by convention + review);
integrations and analytics stay stable across renames; academy-level
overrides are a contained future extension (open decision).

---

## ADR-004 — Multi-tenant single database with organization_id anchoring

**Context.** Options: database-per-tenant, schema-per-tenant, shared tables
with row scoping.

**Decision.** Shared tables; every tenant-scoped row carries
`organization_id`; isolation enforced by RLS + server authorization.
Database-per-tenant is rejected for operational cost at this stage;
extraction of a single giant tenant remains possible later precisely
because all rows are org-keyed.

**Consequences.** Migration simplicity, cross-tenant ops (platform admin)
feasible; isolation depends on discipline — hence the mandatory RLS test
suite and denormalized org_id even where derivable.

---

## ADR-005 — PostgreSQL via Supabase

**Context.** The platform needs Postgres, auth, storage, and RLS with low
operational overhead. The team already operates Supabase elsewhere.

**Decision.** PostgreSQL as the system of record, provisioned through
Supabase (dedicated NovaKore projects; dev project first — **no production
project and no reuse of any existing project**). Supabase Auth for
identity, Supabase Storage for media, RLS as the isolation net.

**Consequences.** Fast Phase 1A; RLS-first design; lock-in risk mitigated
by keeping business logic in the app layer and SQL portable (risk R-15);
all Supabase-specific behavior validated against current official docs at
implementation time.

---

## ADR-006 — RLS _plus_ server-side authorization (defense in depth)

**Context.** RLS alone makes fine-grained business authorization tortured;
app-only authorization makes one bug a tenant breach.

**Decision.** Two mandatory layers: RLS for coarse tenant isolation (+
sensitive-row restriction), server-side `can()` for every business
decision. UI state is never an authorization mechanism. Service-role usage
confined to named internal operations with explicit org scoping.

**Consequences.** Some duplicated checks (accepted); authorization is
testable at both layers; permission catalog is platform-defined and finite
to keep RLS predicates sane.

---

## ADR-007 — Draft rows + immutable published version snapshots

**Context.** Learners need stability and evidence ("what did they see");
authors need free editing; naive in-place versioning corrupts both.

**Decision.** Mutable draft rows; publishing writes immutable
`lesson_versions` (frozen validated block arrays) and `course_versions`
(structure pinning lesson_version ids). Progress pins version ids.
Enrollments float to latest published version in Phase 1; per-enrollment
pinning is a schema-compatible later option.

**Consequences.** Storage cost of snapshots (bounded: text-dominant JSONB);
trivially correct rendering and evidence; version-performance analytics
becomes possible; `module_versions`/`completion_records` eliminated.

---

## ADR-008 — Versioned, schema-validated content blocks (no JSON dumping ground)

**Context.** Modular blocks need flexible payloads; unvalidated JSONB rots
into an unmigratable swamp.

**Decision.** Discriminated unions with per-`(type, schemaVersion)` Zod
schemas in a central registry (`@novakore/domain`); writes and publishes
validate; schema changes are additive versions with registered pure
migration functions; published snapshots are never rewritten (renderers
support historical versions). Same discipline applies to assessment items,
rule trees, event payloads, and settings values.

**Consequences.** Every new block type costs schema + editor + renderer +
tests (deliberate friction); the registry is the single source of truth,
proven by architecture tests in `packages/domain`.

---

## ADR-009 — Event-driven rules engine, prerequisites-first delivery

**Context.** Modular progression needs conditions/outcomes, but a full
engine early would be speculative complexity.

**Decision.** Ship simple `prerequisites` (completion edges, synchronous
unlock) in Phase 1C. Build the full engine in Phase 3 as event-driven,
idempotent, versioned, explainable evaluation over typed condition trees —
whose schema is designed now and covers the prerequisite case, making
migration mechanical. Monotonic outcomes only (no lock/revoke) to eliminate
conflict classes.

**Consequences.** Phase 1 stays small; no foundational redesign later;
time-based and external conditions get a scheduler/ingest path when the
engine lands.

---

## ADR-010 — AI provider abstraction; draft-only generation

**Context.** AI must be structural but vendor-portable, cost-governed, and
safe. Vendor coupling and silent auto-publish are the two failure modes.

**Decision.** Platform `AiProvider` interface with logical model profiles,
registered versioned prompt templates, Zod-validated structured outputs,
per-org budgets/rate limits, full usage records. **AI-generated authoring
content never publishes automatically**; learner AI has zero
state-mutating authority. No provider connection before Phase 2, and then
behind an owner-approved budget.

**Consequences.** Slight indirection overhead; vendor swaps and fallbacks
become config; every AI behavior is auditable and eval-gated.

---

## ADR-011 — Built For Her as first tenant, zero special-casing

**Context.** First tenants pull platforms toward themselves; BFH must
prove NovaKore, not bend it.

**Decision.** BFH is one `organizations` row plus configuration/content.
Every BFH capability maps to a tenant-generic primitive (see integration
doc's capability table). Anti-contamination rules are review-enforceable:
no BFH identifiers in platform code, no BFH-only columns, no repo
cross-imports.

**Consequences.** Some BFH desires will be slower (must be generalized
first); the platform stays sellable to the full tenant list; the
integration contract doubles as the reference for every future tenant
integration.

---

## ADR-012 — Integration boundary: REST API + signed webhooks + SSO deep links

**Context.** External systems (BFH first) need identity linkage, data
sync, and embedded-feeling experiences without platform coupling.

**Decision.** Org-scoped `/v1` REST API (API keys with permission
subsets), HMAC-signed webhooks with retry/dead-letter, short-lived
single-use SSO handoff tokens + deep links. Embedded components deferred
to Phase 4. Inbound external events are generic typed payloads available
to the rules engine.

**Consequences.** Deep-link-first keeps Phase 1D honest; the contract is
additively versioned; no tenant-specific endpoints ever.

---

## ADR-013 — Modular monolith; no microservices

**Context.** Service separation multiplies operational cost and
distributed failure modes long before scale demands it.

**Decision.** One Next.js application (app + API routes/server actions)
with internal modular boundaries expressed as workspace packages
(`domain`, later `db`, `ai`, `ui`). Async work (webhooks, rules, outbox
fan-out) runs as queue/scheduled jobs within the same deployment
platform, not separate services. Revisit only with documented scale
evidence (Phase 4 at earliest).

**Consequences.** Simple deploys, transactional integrity, refactor-friendly
boundaries; discipline required to keep package boundaries clean (import
lint rules in Phase 1B).

---

## ADR-014 — UUIDv7 identifiers; fractional-index ordering

**Context.** Keys and ordering are hard to change later. Random UUIDv4
fragments indexes; integer positions force sibling rewrites on reorder.

**Decision.** UUIDv7 primary keys everywhere (time-ordered, generated
app-side or via pg function per Supabase-era validation). Orderable
children (blocks, modules, lessons, path nodes) use fractional-index
string positions.

**Consequences.** Index locality, sortable ids, concurrent-edit-friendly
reordering; requires a vetted fractional-index implementation (Phase 1B).

---

## ADR-015 — Media storage: Supabase Storage + governed metadata (resolves D-07)

**Context.** Branding (Phase 1B) and content images (Phase 1C) need
binary storage. Options: relational bytea/data-URLs (rejected: bloat,
no CDN path), external object store (rejected: second vendor for no
gain), Supabase Storage (already provisioned, RLS-capable).

**Decision.** Supabase Storage with private buckets (`org-branding`,
`platform-branding`) plus a `media_assets` metadata table as the record
of truth. Deterministic tenant-scoped paths embedding the organization id;
per-kind policy constants in `@novakore/domain` (`ASSET_POLICY`); signed
URLs for serving; pending→active→replaced→archived lifecycle with
retained history; SVG treated as hostile input (reject-not-rewrite gate +
img-only rendering). Storage RLS and relational RLS must agree and are
both tested against the real database.

**Consequences.** No public buckets by default; uploads flow through the
user-session client (no service-role usage); replacement preserves
auditability; cleanup of stale pending rows is a documented operator
action until the Phase 1C job runner exists. Details:
[media-assets.md](media-assets.md).

---

## ADR-016 — Data access: supabase-js + typed domain modules, no ORM (resolves D-08)

**Context.** Phase 1A used supabase-js with generated types and thin
server actions. The question was whether to adopt an ORM/query-builder
before the schema grows.

**Decision.** Stay on supabase-js + generated database types + explicit
per-domain data-access modules + domain validation + `can()` + RLS. No
Prisma, Drizzle, GraphQL, or generic repository abstraction. Every
mutating path follows the nine-step contract in
[data-access-layer.md](data-access-layer.md).

**Consequences.** Queries remain visibly RLS-shaped and auditable; some
verbosity is accepted; the decision is revisited only via a superseding
ADR backed by concrete pain evidence.

---

## ADR-017 — Enrollments pin the published course version at creation (amends ADR-007)

**Context.** ADR-007 left Phase 1 enrollments floating to the latest
published version. Implementation exposed the cost: a learner mid-course
whose course re-publishes would silently see restructured content, and
"what did they see" evidence would require reconstructing publication
timelines. Floating versions also make completion evaluation ambiguous
(against which structure?).

**Decision.** Course-target enrollments pin
`enrollments.pinned_course_version_id` to the course's current published
version at creation (`create_enrollment` refuses courses with no published
version). Path-target enrollments pin per-course at first start: the first
`record_lesson_progress` call creates the course-level `progress_records`
row carrying the pinned `course_version_id`. All learner reads and all
progress writes resolve course-progress pin → enrollment pin → current
published, in that order; lesson progress additionally pins the exact
`lesson_version_id` from the pinned structure. There is **no silent
migration of active learners** — moving an enrollment to a newer version
is a future explicit, audited operation.

**Consequences.** Learners get a stable course for the life of the
enrollment; completions remain valid evidence against their exact version
even as newer versions publish; version-performance analytics gets honest
cohorts. Cost: learners do not automatically receive content fixes
(accepted; the future migration op is the remedy), and every read path
must resolve the pin chain (centralized in `lib/data/learning.ts` and
`record_lesson_progress`).

---

## ADR-018 — Analytics table + transactional outbox via app.emit_event

**Context.** Phase 1C events must be trustworthy (a completion without its
event, or vice versa, corrupts both analytics and future integrations),
but no queue/worker infrastructure exists yet and Postgres partitioning
now would be speculative.

**Decision.** Two tables, one writer. `analytics_events` is a plain
append-only indexed table (no partitioning yet; a partition playbook is
documented in [analytics-and-events.md](analytics-and-events.md) with the
trigger threshold). `outbox_events` is the transactional outbox for future
fan-out (webhooks, aggregates). Both rows are written **only** by
`app.emit_event(...)`, which every learning RPC calls inside the same
transaction as its state change: the domain change and its event commit or
roll back together. Idempotency: deterministic `idempotency_key` per
logical event with `on conflict do nothing` — replayed operations emit
nothing. `outbox_events` has zero client access (no policies, no grants
for `authenticated`/`anon`); a worker with claim/retry/dead-letter
semantics is deferred to the phase that needs fan-out
([transactional-outbox.md](transactional-outbox.md)).

**Consequences.** Events are exactly-once per logical action and can never
diverge from state; tenants cannot observe or forge outbox traffic; the
unprocessed outbox accumulates harmlessly (bounded by event volume) until
the worker lands. The event envelope in the analytics doc §2 is realized
as flat columns (`actor_user_id` instead of the actor object — system/ai/
integration actors arrive with those phases).

---

## ADR-019 — Assessment delivery: lesson-level assignments, RPC-gated learner payloads

**Context.** Phase 1D had to attach assessments to learning content
without reopening the frozen 1C course-version structure, and had to
serve question content to learners whose RLS rightly cannot read
`assessment_versions` (the rows carry correct-answer configuration).
A generic polymorphic assignment target and client-side item filtering
were both rejected.

**Decision.** Three coupled choices:

1. **Assignments attach to LESSONS** (`assessment_assignments`), pinning
   an exact `assessment_version_id`, outside the course-version snapshot
   — course versions stay untouched; the lesson viewer queries active
   assignments at render time. Course-version/module/path-node targets
   are future explicit assignment types, not a polymorphic column.
   Completion coupling is a declared `completion_effect`
   (`complete_lesson` | `none`) plus a hard gate inside
   `record_lesson_progress`: a required completing assessment owns the
   lesson's completion.
2. **Learner item content flows only through
   `get_assessment_attempt_payload`** — a SECURITY DEFINER constructive
   allowlist (never subtractive stripping) mirrored by the domain's
   `toLearnerItemView`. Correct answers, feedback config, and rubrics
   structurally cannot reach a learner client.
3. **File submissions are a guarded deferral**: the item type is fully
   modeled against the future ADR-015 submissions bucket, and until it
   exists learners record a bounded plain-text note routed to review —
   the UI says so; nothing fakes an upload.

**Consequences.** 1C architecture is untouched (no conflict arose);
assignments re-pin by archive-and-attach (documented); the lesson viewer
does one extra bounded query; adding new assignment targets later means
new explicit columns/types, not schema surgery; the payload RPC is the
single place to audit for answer leakage.

---

## ADR-020 — Learning Studio: one authoring environment, domain stays authoritative

**Context.** Phase 2 needed a spatial authoring environment (path canvas,
continuous lesson editor, AI, library, review) without letting a visual
layer become a second source of truth or forking the trusted renderer.

**Decision.** The Studio is a set of surfaces under `/admin/studio` over
the SAME domain model, RPCs, and RLS as the rest of authoring — no new
authority. The visual path canvas is presentation only: `path_layouts`
stores coordinates separately from semantic ordering, and every canvas
action mirrors into a keyboard-accessible ordered list that is the
authoritative editor. `validatePathGraph` (pure) powers cycle/unreachable/
orphan feedback, but the 1C database trigger remains the cycle authority.
Learner previews render through the ONE trusted block renderer; there is
no separate preview implementation.

**Consequences.** The Studio can be redesigned freely without touching
invariants; accessibility is structural, not retrofitted; the canvas can
lag or fail without risking data correctness.

---

## ADR-021 — Reusable content library with link-or-copy and controlled versioning

**Context.** Authors need to reuse blocks across lessons without a
cross-tenant leak vector or an uncontrolled shared-edit blast radius.

**Decision.** `reusable_blocks` are org-owned (optional `academy_id`
scope). Insertion into a lesson is explicit: **link** keeps
`content_blocks.source_reusable_block_id` (shared updates flow on the
draft's next publish — published snapshots stay frozen), **copy** creates
an independent block. Data edits bump a monotonic `version` via trigger.
No cross-tenant references (org-scoped FK); no public marketplace.

**Consequences.** Usage is auditable (usage counts from the source FK);
shared updates never mutate published history; a linked block's blast
radius is visible before republish.

---

## ADR-022 — Development AI provider selection (mock / deterministic / Anthropic)

**Context.** No AI credentials exist in the development environment, yet
the abstraction, workflow, budget, and UI must be provably correct.

**Decision.** A server-only `AiProvider` interface with three adapters
selected by `NOVAKORE_AI_PROVIDER`: `mock` (default; realistic fixtures),
`deterministic` (fixtures + forced-failure/invalid hooks for tests), and
`anthropic` (live; requires `ANTHROPIC_API_KEY`, UNVERIFIED without it).
Logical model profiles (`drafting`/`structured`/`rewrite`) map to
provider models inside the adapter. Keys never reach the browser; the
Anthropic default models are the current Claude 5 family.

**Consequences.** Every AI path is testable now; going live is a config
change, not a rewrite; provider swaps are contained to the adapter.

---

## ADR-023 — Governed AI: draft-only outputs through a validate-and-reconcile ledger

**Context.** AI must be structural but incapable of publishing, granting,
issuing, or altering learner state, and must never overspend.

**Decision.** Realizes ADR-010 for authoring. Every generation runs
reserve (SQL budget hard-stop) → provider call (server) → registered
Zod-schema validation (invalid output discarded) → settle (cost
reconciliation) → accept/reject. Accepting inserts REAL validated DRAFT
content re-checked through `contentBlockSchema`; nothing AI-produced can
reach `publish_*`, permissions, credentials, or progress. The full
lifecycle is recorded in `ai_generations` (provider, model, operation,
objective, sources, tokens, cost, status).

**Consequences.** AI is auditable and eval-gateable; the accept step is
the single trust boundary; malformed output fails safely.

---

## ADR-024 — AI budget enforcement in integer cents with a platform hard cap

**Context.** Owner decision 5: a hard $50/month development cap, tracked
per org/provider/profile/operation/user, no silent overage, no float
money.

**Decision.** `ai_budgets.monthly_limit_cents` is CHECK-capped at 5000
(the platform ceiling). `reserve_ai_generation` takes a per-org advisory
lock, sums committed + reserved cents for the UTC month, and raises when
the new reservation would exceed `least(org_limit, 5000)` — a hard stop.
Costs are integer-cent ESTIMATES (ceil per side) until reconciled against
provider invoices (documented; not implemented in dev). Platform admins
adjust the org limit; tenants can never exceed the cap.

**Consequences.** No floating-point money; concurrent reservations are
serialized; overage is impossible; estimates are honest about their
nature.

---

## ADR-025 — Outbox delivery via a scheduled Supabase Edge Function

**Context.** ADR-018 deferred the outbox worker. Phase 2 needs delivery
without introducing Kafka/Redis/a standalone service.

**Decision.** A single scheduled Supabase Edge Function
(`webhook-worker`) drains the outbox: `app.claim_webhook_deliveries`
fans pending outbox events out to matching active endpoints and claims
them with `FOR UPDATE SKIP LOCKED` (no duplicate concurrent work); the
function signs, delivers, and settles via `app.settle_webhook_delivery`
(bounded backoff, dead-letter after 6 attempts). Public
`worker_*` wrappers (service_role only) bridge PostgREST to the
app-schema logic; the service-role key lives only in the function
environment. Events with no subscribed endpoint settle as processed.

**Consequences.** No new infrastructure; at-least-once delivery with
dedupe on the analytics event id; the worker is stateless and idempotent;
scheduling is a dashboard cron trigger (owner action).

---

## ADR-026 — Webhook SSRF policy: allowlist-by-exclusion + post-resolution recheck

**Context.** Outbound webhooks are an SSRF vector (metadata services,
private networks, redirect pivots).

**Decision.** Destinations must be https (plain http only to localhost in
an opt-in dev mode). A static check blocks metadata hosts, loopback,
link-local, ULA/private ranges, `.internal`/`.local`, and credentialed
URLs; the worker additionally sets `redirect: "error"` (no redirect
pivot), caps response bodies at 4KB, redacts secrets from stored
excerpts, and rechecks resolved addresses. Production egress controls
(a proxy/allowlist) are documented as a future hardening step.

**Consequences.** The common SSRF classes are closed in code; the policy
is shared (pure functions) between the domain tests and the worker;
production hardening is scoped, not assumed.

---

## ADR-027 — Verification rate-limiting: application abstraction now, edge enforcement later

**Context.** Owner decision 4: keep public credential verification, add
rate limiting without a new infrastructure service this phase.

**Decision.** Public verification stays anonymous and privacy-safe
(ADR — 1D). A rate-limiting ABSTRACTION is documented (a keyed
token-bucket interface the `/verify` route and `verify_credential` will
consult) with the production enforcement plan being an edge middleware /
CDN rule keyed on IP + code prefix. No standalone rate-limit service is
added in Phase 2; the 64-bit random code space remains the primary
enumeration defense.

**Consequences.** The interface exists to wire enforcement into later;
dev verification is unthrottled (documented); no premature infrastructure.
