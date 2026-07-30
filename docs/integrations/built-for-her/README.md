# Built For Her × NovaKore — Integration Specification

Status: **CONTRACT ONLY (Phase 1D).** This directory is the as-built
specification for the future BFH integration. Nothing here is connected
to any BFH system; the payload schemas are typechecked and tested in
`packages/domain/src/bfh-contract.ts`, and the development tenant
(`bfh-dev`) exercises every primitive with fixture data. Implementation
is explicitly deferred to a later, owner-approved phase.

Documents:

- [contract.md](contract.md) — identity handoff, APIs, webhooks, deep
  links, embedding, error/retry/idempotency/signature rules, the
  persona/audience model + mapping table, versioning.
- [phase-alpha-validation.md](phase-alpha-validation.md) — the dev-only
  alpha validation: happy-path + failure-mode matrix, security, performance,
  risks, and per-audience readiness (Member / Coach-Professional / Admin).
- This README — ownership boundary, tenant/user mapping, environments,
  rollout sequence, explicit deferrals.

**Learning audiences (Validation phase).** BFH runs as ONE NovaKore tenant
serving multiple, isolated learning audiences — `member` (coaching client),
`coach`, and `professional_learner` — distinct from the NovaKore role.
Audience is an explicit handoff claim, tags each Journey, and gates
assignment; it is never inferred from the BFH app role. Dev fixtures:
`bfh.member@novakore.test` (member Journey _Strong Foundations_) and
`bfh.coach@novakore.test` (coach _Coach Certification_ Journey).

## 1. Data ownership boundary (normative)

**NovaKore owns** — and is the source of truth for:

- Learning content (systems, paths, courses, lessons, blocks)
- Assessment definitions, versions, and assignments
- Attempts, responses, reviews, and grades
- Educational progress and completion evidence
- Certificates, credentials, and verification
- Learning events (the analytics log)

**Built For Her owns** — and NovaKore is NEVER the source of truth for:

- Member subscription and billing state
- Training programs, workouts, and prescriptions
- Readiness, recovery, and nutrition data
- Coaching assignments and BFH business rules
- BFH-specific health and performance data

No BFH health, readiness, nutrition, or performance data crosses into
NovaKore — not in handoff claims, not in API payloads, not in webhook
acknowledgments. NovaKore tells BFH _what a member learned_; BFH decides
what that means for subscriptions and training. A BFH subscription
lapse is enacted by BFH calling the enrollment API — NovaKore never
reads subscription state.

## 2. Tenant and organization mapping

- BFH maps to exactly ONE NovaKore organization (production:
  provisioned in the integration phase; development: `bfh-dev`,
  "Built For Her (Dev Tenant)").
- All BFH-facing vocabulary is the standard terminology overlay
  (Journey/Program/Phase/Coach/Member/Evaluation/Credential over
  canonical learning_path/course/module/instructor/learner/assessment/
  certificate). Zero BFH identifiers exist in platform code (ADR-011).

## 3. User mapping and access levels

- BFH's stable `externalUserId` (opaque to NovaKore) links to a NovaKore
  user via the `external_identities` table (entity model 2.9b; lands
  with the integration phase). Email is the join hint at first handoff;
  the external id is the durable key.
- Access-level claims map BFH roles to NovaKore system roles:
  `member → learner`, `coach → instructor`, `admin →
organization_admin`. BFH asserts the level; NovaKore enforces its own
  permission catalog — a BFH claim can never mint permissions outside
  those bundles.

## 4. Environments

|              | Development (now)                                                                | Production (deferred)                  |
| ------------ | -------------------------------------------------------------------------------- | -------------------------------------- |
| Organization | `bfh-dev` on novakore-dev                                                        | new org on a future production project |
| Users        | `bfh.*@novakore.test` fixtures only                                              | real members via identity handoff      |
| Data         | seeded journey/program/assessments + Phase 2 interactive lesson + reusable block | live                                   |
| Webhooks/API | schemas + tests only                                                             | signed, retried, monitored             |

Real BFH production users, subscriptions, and databases are never
touched from this repository. The `built-for-her*` and G3 repositories
remain strictly off-limits.

**Phase 2 development demonstration (as built).** The `bfh-dev` tenant now
proves Studio modularity end to end under the Journey/Program/Phase/Coach/
Member/Evaluation/Credential terminology overlay: the Coach Certification
learning system → Certification Journey (visual path) → Foundations
Program with an interactive "Coaching Fundamentals" Phase (flashcards,
knowledge check, scenario, reflection), the two Evaluations from Phase 1D,
a completion credential, a reusable "Intake trust callout" library block,
and AI-drafted content via the mock provider. This is development data
only — no production connection, users, subscriptions, or health data.

## 5. Rollout sequence (integration phase, owner-gated)

1. Provision the production organization + API key (org-scoped, ADR-012).
2. Implement `external_identities` + the identity handoff endpoint.
3. BFH implements the deep-link entry; smoke-test SSO round trip.
4. Enable the enrollment + assignment APIs (idempotent, dry-run first).
5. Enable outbound webhooks against a BFH staging receiver; verify
   signatures, retries, and dedupe.
6. Pilot cohort; then general rollout. Embedded-academy view last.

## 6. Explicitly deferred

Production SSO, webhook dispatcher/worker, `external_identities` table,
API-key issuance, embedded components (Phase 4 per ADR-012), production
email/certificate delivery, and any BFH database connection. Deferred ≠
undesigned: every payload above is schema-frozen and tested now.
