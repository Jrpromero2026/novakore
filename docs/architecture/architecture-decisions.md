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
