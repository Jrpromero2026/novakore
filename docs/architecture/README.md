# NovaKore Architecture Specification

This directory is the authoritative architecture specification for NovaKore, an
AI-native modular learning operating system. It was produced during the Product
Architecture Phase (2026-07) and governs implementation until superseded by an
ADR.

## Reading order

| #   | Document                                                                 | Answers                                                 |
| --- | ------------------------------------------------------------------------ | ------------------------------------------------------- |
| 1   | [product-domain.md](product-domain.md)                                   | What NovaKore is, owns, and refuses to own              |
| 2   | [entity-model.md](entity-model.md)                                       | Canonical entities, ownership, lifecycle, phasing       |
| 3   | [tenancy-and-authorization.md](tenancy-and-authorization.md)             | Isolation, roles, permissions, RLS                      |
| 4   | [learning-content-model.md](learning-content-model.md)                   | Blocks, schemas, versioning, publish workflow           |
| 5   | [rules-engine.md](rules-engine.md)                                       | Conditions, outcomes, evaluation, safety                |
| 6   | [assessment-and-competency-model.md](assessment-and-competency-model.md) | Assessments, grading, competencies, credentials         |
| 7   | [ai-architecture.md](ai-architecture.md)                                 | Provider abstraction, authoring AI, learner AI, safety  |
| 8   | [analytics-and-events.md](analytics-and-events.md)                       | Event taxonomy, envelope, storage, privacy              |
| 9   | [built-for-her-integration.md](built-for-her-integration.md)             | First-tenant integration contract and boundaries        |
| 10  | [ui-architecture.md](ui-architecture.md)                                 | Surfaces, design system direction, component categories |
| 11  | [phased-implementation-plan.md](phased-implementation-plan.md)           | Phase 1A → 4 roadmap with gates                         |
| 12  | [architecture-decisions.md](architecture-decisions.md)                   | ADR-001 … ADR-019                                       |
| 13  | [risks-and-open-decisions.md](risks-and-open-decisions.md)               | Risk register and owner-approval items                  |

## Implemented-subsystem docs (Phase 1B–1C)

Written as-built, updated with the code they describe:

| Document                                                                           | Covers                                                      |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| [media-assets.md](media-assets.md)                                                 | Governed media storage (ADR-015)                            |
| [data-access-layer.md](data-access-layer.md)                                       | supabase-js + typed domain modules (ADR-016)                |
| [learning-domain.md](learning-domain.md)                                           | Learning engine overview: entities, layering, invariants    |
| [versioning-and-publishing.md](versioning-and-publishing.md)                       | Draft → immutable version publish workflow                  |
| [enrollment-and-progress.md](enrollment-and-progress.md)                           | Enrollments, version pinning (ADR-017), progress evidence   |
| [prerequisites-and-unlocks.md](prerequisites-and-unlocks.md)                       | Sequence/prerequisite gating, the single unlock computation |
| [transactional-outbox.md](transactional-outbox.md)                                 | Event emission + outbox contract (ADR-018)                  |
| [../domain/content-blocks.md](../domain/content-blocks.md)                         | Block registry, safe-text contract, evolution               |
| [../domain/event-catalog.md](../domain/event-catalog.md)                           | Registered event types and idempotency keys                 |
| [../security/learning-authorization.md](../security/learning-authorization.md)     | Learning RLS + RPC authorization                            |
| [../permissions/permission-matrix.md](../permissions/permission-matrix.md)         | Permission catalog × system roles                           |
| [assessment-domain.md](assessment-domain.md)                                       | Assessment engine overview (Phase 1D)                       |
| [assessment-versioning.md](assessment-versioning.md)                               | Draft → immutable assessment versions, assignment pinning   |
| [attempt-and-grading.md](attempt-and-grading.md)                                   | Attempts, deterministic grading, retakes, time limits       |
| [manual-review.md](manual-review.md)                                               | Subjective review workflow                                  |
| [certificates-and-credentials.md](certificates-and-credentials.md)                 | Templates, rules, issued credentials, verification          |
| [../integrations/built-for-her/README.md](../integrations/built-for-her/README.md) | BFH integration contract (specification only)               |

## Companion package

`packages/domain` (`@novakore/domain`) began as a type-level prototype; since
Phase 1B–1C it is **product code**: the canonical schema registry (content
blocks, snapshots, completion rules, event envelope), the permission catalog,
theming, and the single unlock/completion computations every surface uses. It
remains pure (no I/O) — all persistence lives behind the data-access layer
([data-access-layer.md](data-access-layer.md)).

## Change control

- Architecture changes require a new or amended ADR in
  [architecture-decisions.md](architecture-decisions.md).
- Anything listed in [risks-and-open-decisions.md](risks-and-open-decisions.md)
  under "Decisions requiring owner approval" must not be implemented until the
  owner resolves it.
- No document here authorizes connecting to production Supabase, the Built For
  Her repositories, or any paid AI provider.
