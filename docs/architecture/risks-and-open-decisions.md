# Risks and Open Decisions

Likelihood/Impact: L/M/H. "Blocks 1A" = must be resolved or actively
mitigated before Phase 1A implementation starts.

## 1. Risk register

| #    | Risk                                                                                                         | Likelihood | Impact | Mitigation                                                                                                                                                     | Matters from |                  Blocks 1A?                   |
| ---- | ------------------------------------------------------------------------------------------------------------ | :--------: | :----: | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----------: | :-------------------------------------------: |
| R-01 | **Over-abstraction** — building generic machinery (rules, block library, competency graph) before real usage |     H      |   H    | Phase gates; eliminated-entities list; "implement the minimum type set" rules in each doc; additions require ADR                                               |      1B      |          No — plan already mitigates          |
| R-02 | **Premature enterprise features** (SSO/SAML, residency, marketplace)                                         |     M      |   M    | Phase 4 gating with per-item demand validation; standing "not now" lists                                                                                       |      2+      |                      No                       |
| R-03 | **Tenant-isolation failure** — one bug leaks tenant data                                                     |     M      | **H**  | RLS on every table + automated cross-org test suite (1A exit gate); server `can()` layer; service-role confinement; org-filtered retrieval double-check for AI |      1A      | **Yes — test suite is a 1A exit requirement** |
| R-04 | **Content-version complexity** — snapshot/pin model confuses authors or bloats storage                       |     M      |   M    | Single versioning pattern reused everywhere (ADR-007/008); float-latest default with pinning deferred; version-diff UI in Phase 2; storage monitored           |      1B      |                      No                       |
| R-05 | **Rules-engine complexity spiral**                                                                           |     M      |   H    | Prerequisites-only until Phase 3; monotonic outcomes; depth/leaf caps; explainability required for every condition type                                        |     1C/3     |                      No                       |
| R-06 | **AI hallucination** — tutor invents methodology/policy; authoring drafts contain confident errors           |     H      |   H    | Grounding + citations + designed refusal; draft-only authoring with human publish gate; eval suites gating template rollout; no AI grade authority             |     2/3      |             No (no AI in Phase 1)             |
| R-07 | **AI cost growth**                                                                                           |     M      |   M    | Per-org budgets + per-user rate limits with hard stops; cost on every generation record; usage dashboards; profile-based model routing (cheap-first)           |      2       |                      No                       |
| R-08 | **Permission sprawl** — tenants demand micro-permissions; matrix rots                                        |     M      |   M    | Platform-defined finite catalog (tenants bundle, never mint); additive-only codes; matrix in docs is normative and tested against seeds                        |      1A      |                      No                       |
| R-09 | **BFH-specific logic leaking into core**                                                                     |     M      |   H    | ADR-011 anti-contamination rules; generalization test; review checklist; no BFH identifiers in platform code (grep-able gate)                                  |     1B+      |                      No                       |
| R-10 | **Analytics privacy** — telemetry becomes surveillance or deanonymizes small cohorts                         |     M      |   H    | Aggregate-first access; n<5 suppression; learner transparency page; retention defaults + pseudonymized erasure; no third-party analytics SDKs                  |      1C      |                      No                       |
| R-11 | **Assessment integrity expectations** exceed platform reality (proctoring demands)                           |     M      |   M    | Honest positioning: signals not surveillance; external proctoring only as Phase 4 integration if validated                                                     |      1D      |                      No                       |
| R-12 | **Media storage costs/abuse** — video uploads balloon                                                        |     M      |   M    | Embed/external-URL-first video; image-only upload in 1B with size/type limits; per-org storage quotas from day one                                             |      1B      |                      No                       |
| R-13 | **Content licensing** — tenants upload material they don't own                                               |     M      |   M    | Tenant ToS responsibility + upload attestation; DMCA-style takedown path (platform admin tooling, Phase 2); no cross-tenant content reuse                      |      1B      |                      No                       |
| R-14 | **Long-running migrations** on grown tables (events, versions)                                               |    L→M     |   M    | Partitioned events from day one; additive-only schema habits; expand-migrate-contract playbook documented before Phase 2                                       |      2+      |                      No                       |
| R-15 | **Platform lock-in (Supabase)**                                                                              |     L      |   M    | Logic in app layer; portable SQL bias; RLS is Postgres-standard; storage behind an internal interface; documented exit sketch                                  |      1A      |                      No                       |
| R-16 | **Excessive microservice design**                                                                            |     L      |   H    | ADR-013 modular monolith; any service split requires a superseding ADR with scale evidence                                                                     |     any      |                      No                       |
| R-17 | **UI scope expansion** — signature surfaces (canvas, editor) swallow phases                                  |     H      |   M    | 1B/1C ship functional-minimal surfaces; "full experience" explicitly Phase 2; per-phase UI scope lists are exhaustive                                          |      1B      |                      No                       |
| R-18 | **Terminology overlay bypass** — hardcoded entity words creep into UI copy                                   |     M      |   L    | Terminology resolver from 1A; review checklist item; copy lint (grep canonical nouns in UI strings) in Phase 2                                                 |      1A      |                      No                       |

## 2. Decisions requiring owner approval (before the phase named)

| #    | Decision                                                                                                           | Needed before | Recommendation                                                               |
| ---- | ------------------------------------------------------------------------------------------------------------------ | ------------- | ---------------------------------------------------------------------------- |
| D-01 | Approve this architecture + phased plan as the governing spec                                                      | 1A            | Approve; amend via ADRs                                                      |
| D-02 | Supabase account/org to host the **new dedicated dev project** (never an existing project); project naming; region | 1A            | New project `novakore-dev`, region nearest primary users (US)                |
| D-03 | Migration tooling: Supabase CLI migrations vs. third-party (e.g. Drizzle) — affects workflow + typegen             | 1A            | Supabase CLI migrations + generated types; revisit ORM question at 1B (D-08) |
| D-04 | Auth scope for dev: email/password + magic link only in Phase 1? OAuth providers later?                            | 1A            | Email/magic-link only in dev; defer OAuth                                    |
| D-05 | Terminology default set: confirm platform default display terms (English)                                          | 1A            | Ship proposed defaults; tenant overrides prove the system                    |
| D-06 | Org slug + custom-domain posture (slugs now, domains Phase 4?)                                                     | 1A            | Slugs only until Phase 4 white-label                                         |
| D-07 | Media storage limits: per-org quota + allowed types for 1B image upload                                            | 1B            | 5 GB/org dev default; images ≤ 10 MB; video embed-only                       |
| D-08 | Data-access layer: raw SQL + generated types vs. query builder/ORM                                                 | 1B            | Decide at 1B start after 1A experience; bias to thin layer                   |
| D-09 | AI provider(s) + monthly budget cap for Phase 2 authoring copilot (paid connection)                                | 2             | Decide at Phase 2 gate; no connection before                                 |
| D-10 | Learner-data retention defaults + tenant configurability bounds                                                    | 1C            | 24-month default as documented                                               |
| D-11 | BFH production go-live: linking real BFH systems/users to a production NovaKore tenant                             | post-1D       | Separate go decision with its own checklist; not part of 1D                  |
| D-12 | Typeface/brand direction for the platform design system                                                            | 2             | Defer; tokens are the architecture                                           |
| D-13 | Academy-level terminology overrides                                                                                | 2+            | Defer until a real tenant needs it                                           |
| D-14 | Localization model (per-locale lesson variants vs. block overlays)                                                 | 2+            | Defer; model is compatible with both                                         |

## 3. Must be decided before Supabase is introduced (subset gate for 1A)

1. **D-02** — account/org, project name, region (and confirmation that no
   existing project — including any BFH project — will be touched).
2. **D-03** — migration tooling, because the first migration defines the
   workflow.
3. **D-04** — auth methods, because Supabase Auth config is part of project
   setup.
4. **RLS test harness approach** — how isolation tests run in CI (local
   Supabase stack vs. dev-project test schema); required because R-03 makes
   the isolation suite a 1A exit criterion.
5. **Secrets handling** — env layout for dev keys (`.env.local`, never
   committed; service-role key server-only), documented in the repo before
   the first key exists.

## 4. Standing constraints (re-affirmed)

No production Supabase connection, no BFH repository changes, no paid AI
connection, no marketplace/billing, no native apps, no SCORM, no HRIS, no
microservices — without explicit owner approval recorded as an ADR.
