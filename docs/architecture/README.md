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
| 12  | [architecture-decisions.md](architecture-decisions.md)                   | ADR-001 … ADR-014                                       |
| 13  | [risks-and-open-decisions.md](risks-and-open-decisions.md)               | Risk register and owner-approval items                  |

## Companion prototype

`packages/domain` (`@novakore/domain`) contains **type-level prototypes and
architecture tests only** — canonical terminology keys, the versioned
content-block schema pattern (Zod discriminated unions), and the rule condition
tree shape. It exists to prove the schema strategy compiles, validates, and
survives the `verify` pipeline. It is not product code and contains no I/O.

## Change control

- Architecture changes require a new or amended ADR in
  [architecture-decisions.md](architecture-decisions.md).
- Anything listed in [risks-and-open-decisions.md](risks-and-open-decisions.md)
  under "Decisions requiring owner approval" must not be implemented until the
  owner resolves it.
- No document here authorizes connecting to production Supabase, the Built For
  Her repositories, or any paid AI provider.
