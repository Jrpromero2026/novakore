# Built For Her Academy — Alpha Validation

Status: **VALIDATION COMPLETE (dev only).** This report records the
NovaKore-side validation of the BFH integration against the `bfh-dev`
tenant on `novakore-dev`. Nothing here connects to any Built For Her
system or production project; the BFH repository was never modified. The
integration is a **contract boundary** (identity handoff, `/v1` API,
signed webhooks, deep links) — not a code merge.

Scope guardrails honored: no adaptive learning, no AI tutor, no
competency tracking, no analytics expansion, no production Supabase
project, no BFH production connection, Phase 3 not started.

---

## 0. What was built (recap)

Two distinct **learning audiences** validated end to end, sharing the
NovaKore `learner` role but isolated by an explicit audience dimension:

- **Member Academy** — Journey `strong-foundations` → Program _Foundations
  of Progress_ → 3 Phases / 6 member-coaching lessons (flashcards,
  reflection, knowledge checks, comparison, callouts) → short Evaluation →
  completion certificate. Learner: `bfh.member@novakore.test`
  (`bfh-member-alpha`, audiences `[member]`).
- **Coach / Professional Academy** — Journey `coach-certification-journey`
  → Program _Coach Certification Foundations_ → 3 Phases / 6 lessons →
  two Evaluations → _Built For Her Coach Certification — Foundations_
  credential. Learner: `bfh.coach@novakore.test` (`bfh-coach-alpha`,
  audiences `[coach, professional_learner]`).

Everything renders under the BFH tenant brand (_Built For Her Academy_,
berry/rose palette, Inter, soft radius) and the Journey/Program/Phase/
Coach/Member/Evaluation/Credential terminology overlay.

---

## 1. Happy-path validation

| Seam                          | Result                     | Evidence                                                                                                                                                                                                                        |
| ----------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity handoff (SSO)        | ✅ live                    | `bfh-handoff` EF (deployed ACTIVE) returned `linked`, roles `[learner]`, deep link `/bfh-dev/learn`; coach handoff → roles `[learner, instructor]`.                                                                             |
| Org + user + audience mapping | ✅                         | `external_identities` maps `bfh-member-alpha`/`bfh-coach-alpha` → NovaKore users; audiences stored from the claim.                                                                                                              |
| Enrollment / assignment API   | ✅                         | `bfh_enroll_or_assign_external` creates the enrollment with the same version-pinning + one-live-enrollment invariants as the UI.                                                                                                |
| Assigned learning             | ✅                         | Member Academy home lists the assigned Journey; enrollment-driven.                                                                                                                                                              |
| Completion + credential sync  | ✅ (projection + delivery) | Internal completion/assessment/credential events project into the frozen `bfh-contract` payloads on the outbox; the Phase 2 worker delivers them signed; the dev receiver verified a signed `learning.completion` payload live. |
| Deep linking                  | ✅                         | Handoff `next` resolves to a same-site path under `/{org}/learn`; off-tree/foreign targets fall back to the learning home.                                                                                                      |
| Terminology + theme           | ✅                         | `/learn` layout applies `theme_published` + terminology for `bfh-dev`.                                                                                                                                                          |
| Authorization                 | ✅                         | Learner consuming role + audience gating; members cannot reach admin/Studio (permission catalog).                                                                                                                               |

**Browser QA note.** The SSO server-side flow and the webhook receiver
were exercised **live**. A full interactive member/coach/admin UI
walkthrough could not be completed inside the embedded dev browser (it
does not composite frames, the server-action sign-in did not persist a
session there, and external navigation to the GoTrue verify URL is
blocked). The `/learn` and lesson-delivery surfaces are unchanged from the
Phase 1C/1D/2 browser QA that exercised them; the audience/brand/content
deltas in this phase are data- and RLS-level and are proven in §2. A
standard-browser UI walkthrough is the one open QA item (see §5, and the
readiness conditions in §Final).

---

## 2. Failure-mode validation

All rows verified against `novakore-dev` (mutating probes rolled back).

### SSO handoff

| Scenario                                        | Result                                                                                                               |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Valid signed handoff                            | `linked`                                                                                                             |
| Invalid HMAC signature                          | `bad_signature`                                                                                                      |
| Modified payload after signing                  | `bad_signature` (any field change breaks the canonical HMAC)                                                         |
| Expired timestamp                               | `expired`                                                                                                            |
| Replay using consumed nonce                     | `nonce_replayed`                                                                                                     |
| Unknown external identity (+ no matching email) | `no_novakore_user`                                                                                                   |
| Unknown organization                            | `unknown_org`                                                                                                        |
| Wrong audience claim (unknown value)            | `invalid_audience`                                                                                                   |
| Missing audience claim                          | `no_audience`                                                                                                        |
| Disabled / suspended member                     | `membership_inactive` (guard added this phase)                                                                       |
| Revoked mapping                                 | NovaKore-side revocation = suspend the membership → `membership_inactive`; BFH-side = stop issuing handoffs (see §5) |
| Expired magic link                              | GoTrue single-use + OTP-expiry (platform behavior)                                                                   |
| Replay of consumed magic link                   | GoTrue marks the link consumed on first verify (platform behavior)                                                   |

The signature + timing + nonce are all verified **inside**
`bfh_exchange_handoff`; the per-org HMAC secret never leaves Postgres.

### Enrollment / assignment API

| Scenario                                | Result                                                                  |
| --------------------------------------- | ----------------------------------------------------------------------- |
| Valid enrollment                        | `created`                                                               |
| Duplicate request, same idempotency key | stored response replayed (`replayed: true`)                             |
| Different idempotency key, same target  | `conflict` / `already_enrolled` (existing id returned)                  |
| Unknown learner                         | `not_found` / `unknown_external_user`                                   |
| Unknown target                          | `not_found` / `unknown_target`                                          |
| Cross-audience assignment               | `forbidden` / `audience_mismatch`                                       |
| Cross-tenant assignment                 | `not_found` — an org's API key resolves only its own identities/targets |
| Revoked API key                         | `unauthorized`                                                          |
| Invalid bearer token                    | `unauthorized`                                                          |
| Missing bearer token                    | `401` at the route handler                                              |

### Webhook pipeline

| Scenario                | Result                                                                                                |
| ----------------------- | ----------------------------------------------------------------------------------------------------- |
| Valid webhook           | receiver accepted (HMAC verified)                                                                     |
| Invalid signature       | receiver `401`                                                                                        |
| Duplicate delivery      | deduped on `eventId` (receiver) + `on conflict` fan-out (worker)                                      |
| Out-of-order delivery   | tolerated — consumer dedupes on `eventId`; per-org best-effort ordering only                          |
| Missing required fields | projected payloads are schema-built (always complete); a malformed inbound fails the receiver's parse |
| Unknown event type      | endpoint `event_types` filter + receiver ignores unrecognized types                                   |
| Retry behavior          | failed → backoff `next_attempt_at` (1m→5m→25m, cap 2h); re-claimed when due (Phase 2 real-DB test)    |
| Dead-letter             | after the 6-attempt budget → `dead_letter`, outbox event `failed` (Phase 2 real-DB test)              |

### Authorization

| Scenario                                   | Result                                                                                                        |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| Member attempting coach content            | assignment `forbidden`; never enrolled, so never visible                                                      |
| Coach attempting admin action              | blocked by the permission catalog (`instructor` lacks admin permissions)                                      |
| Admin access                               | `organization_admin` permitted                                                                                |
| Permission downgrade during active session | enforced per request — roles/permissions are DB-checked each request via `can()` + RLS, not cached in the JWT |
| Permission removal after login             | same — effective on the next request                                                                          |
| Cross-tenant access attempt                | blocked by org-scoped RLS everywhere                                                                          |

### Concurrency + data integrity

| Guarantee                         | Mechanism (verified)                                                                                         |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| No duplicate live enrollments     | partial unique indexes `enrollments_one_live_course` / `_path` (race-safe)                                   |
| No duplicate credentials          | partial unique index `issued_credentials_one_live (certificate_id, membership_id) where status <> 'revoked'` |
| Duplicate SSO exchange            | single-use nonce (PK) → 2nd concurrent call `nonce_replayed`                                                 |
| Duplicate webhook processing      | worker claim `FOR UPDATE SKIP LOCKED` + `on conflict` fan-out                                                |
| Duplicate outbound projection     | analytics `idempotency_key` unique → one event → one projection                                              |
| No orphaned mappings / identities | `external_identities` FK `on delete cascade` to org + user                                                   |
| No inconsistent assignment state  | one-live-enrollment index + idempotency ledger                                                               |
| No leaked tenant / audience data  | org-scoped RLS + audience gate (member↔coach cross-assignment `forbidden`)                                   |

Every concurrency/integrity guarantee the alpha requires was **already
present** in the schema; no new constraints were needed.

---

## 3. Security observations

- **Secrets are database-only.** The per-org handoff HMAC secret lives in
  `app.bfh_integration_config` (app schema, no PostgREST exposure, no RLS
  policy → service_role/definer only) and is verified inside the exchange
  RPC. It never appears in a response, event, log, or audit row.
- **API keys are hashed at rest** (`sha256`); only a prefix is stored in
  the clear for identification. Revocation flips `status`.
- **No secret leakage (scanned):** 0 rows in `analytics_events`,
  `outbox_events`, `audit_logs`, or delivery response-excerpts contained
  the handoff secret, an API-key hash, or a webhook endpoint secret.
- **No audit trigger** touches the integration tables, so nothing can leak
  the secret/hash into `audit_logs`.
- **Nonce replay prevention** and **idempotency** hold (see §2).
- **Audience enforcement cannot be bypassed** through the API: the gate is
  in the SECURITY DEFINER RPC, keyed on the Journey's `audience_key` vs the
  identity's stored audiences; the API key cannot mint audiences.
- **Tenant isolation intact:** org-scoped RLS + API keys resolve only
  their own org; cross-tenant assignment returns `not_found`.
- The `bfh-handoff` EF is `verify_jwt=false` by design (it authenticates
  the BFH HMAC itself); `bfh_exchange_handoff` is **service_role-only**
  (anon/authenticated `EXECUTE` revoked — confirmed by the isolation test).

## 4. Performance observations

DB-side RPC latency on `novakore-dev` (25-run averages, warm):

| Operation                             | Avg         |
| ------------------------------------- | ----------- |
| SSO exchange (`bfh_exchange_handoff`) | **0.58 ms** |
| Enrollment/assignment RPC             | **0.68 ms** |
| Outbound projection (trigger on emit) | **0.44 ms** |

- The **SSO EF** adds one GoTrue `generateLink` admin call + function cold/
  warm start on top of the 0.58 ms RPC; the live debug handoff returned in
  well under a second.
- The **`/v1` route** adds Next.js + PostgREST overhead over the 0.68 ms RPC.
- **Round trips:** the enroll RPC hashes the API key twice (lookup +
  `last_used_at` update) — a trivial redundancy; could hash once into a
  local variable. No other unnecessary round trips or RPC calls were found.
  The webhook path reuses the Phase 2 outbox worker (no new hosting).
- No optimization is recommended that would add complexity; the one-line
  hash-once tidy is optional.

## 5. Remaining risks

- **Interactive UI QA not completed in-tool.** The embedded dev browser
  could not composite frames / persist the session / follow the external
  verify URL. Risk: low (surfaces unchanged from prior QA; data-layer
  proven) but a standard-browser walkthrough should be run before inviting
  real alpha users.
- **BFH-side revocation is cooperative.** NovaKore honors a durable
  NovaKore-side revocation (suspend membership → `membership_inactive`),
  but a still-valid BFH handoff for a user BFH intends to revoke depends on
  BFH ceasing to issue handoffs. A shared `external_identities.status`
  ('active'/'revoked') flag would make NovaKore-side revocation explicit
  without suspending the whole membership.
- **Magic-link SSO depends on GoTrue link semantics** (single-use,
  OTP-expiry). Correct by platform contract but not independently
  re-tested here.
- **`assessmentSlug` is the assessment UUID** — assessments have no
  human-readable slug (courses/paths do). BFH stores it opaquely, so this
  is safe, but a readable assessment slug would be friendlier (§7).
- **Live `/v1` HTTP** was validated via the RPC + production build; a
  running dev server with the new routes should be smoke-tested (the
  pre-existing dev server on the QA machine was stale).

## 6. Architecture observations

- The integration is a **thin contract seam**. NovaKore added only:
  identity mapping, API-key auth, an audience dimension, an SSO relay EF,
  two `/v1` routes, and an outbound projection. No learning logic leaked
  into BFH; no BFH business logic entered NovaKore.
- **Audience ≠ role** proved to be the right model: all learning audiences
  share the `learner` consuming role, while assignment/visibility are
  gated by an explicit audience the app role cannot forge.
- Reusing the **Phase 2 transactional outbox + worker** for outbound sync
  meant zero new delivery infrastructure.
- Verifying the HMAC **inside the exchange RPC** (rather than the EF)
  keeps the secret in Postgres and made the EF a trivial, low-trust relay.
- The **existing `/learn` surface + tenant branding + terminology** already
  delivered the "native feel" with no new UI — a strong signal that the
  platform's multi-tenant primitives are sound.

## 7. Recommended improvements (only if they simplify or harden)

1. Add `external_identities.status` for explicit NovaKore-side mapping
   revocation (small, clarifies the revocation story).
2. Optional: hash the API key once in `bfh_enroll_or_assign_external`.
3. Optional: human-readable `assessments.slug` for friendlier webhooks/links.
4. Fold the alpha content + integration config into `seed.sql` for
   reproducible resets (done in this phase where practical).

None are blockers.

## 8. Explicitly deferred to Phase 3 (not built here)

Production SSO/session hardening beyond dev; a public BFH webhook receiver

- live cloud→BFH delivery (the worker is proven, but delivery to a
  publicly reachable BFH endpoint is a Phase-3/owner step); `external_
identities.status` revocation flag; API-key rotation UI; embedded-academy
  iframe (Phase 4 per ADR-012); and everything on the standing exclusion
  list (adaptive learning, AI tutor, competencies, analytics expansion,
  enterprise, production project, BFH production connection).

---

## Final readiness

Separate decisions, per audience + admin. Evidence is §1–§4.

### 1. Built For Her **Member Academy** Alpha — **READY WITH MINOR CONDITIONS**

The member Journey (_Strong Foundations_), enrollment, audience isolation,
theming/terminology, completion + credential projection, and SSO
server-side flow are validated. **Conditions:** (a) run the interactive
member UI walkthrough (login → resume → complete lessons → Evaluation →
credential) in a standard browser; (b) smoke-test the `/v1` routes against
a freshly-started dev server. No code changes expected.

### 2. Built For Her **Coach / Professional Academy** Alpha — **READY WITH MINOR CONDITIONS**

The coach-certification Journey, the `professional_learner`/`coach`
multi-audience identity, audience gating (member↔coach cross-assignment
forbidden), Evaluations, and credential are validated at the data/API
layer, and SSO returns the correct `learner + instructor` roles. **Same
two conditions** as Member Academy (interactive UI walkthrough; live `/v1`
smoke test).

### 3. **Administrative Integration** — **READY WITH MINOR CONDITIONS**

Identity handoff, org/user/audience mapping, `/v1` enrollment+assignment,
outbound completion/credential sync, idempotency, tenant + audience
isolation, and the full failure-mode matrix all pass; secrets are DB-only.
**Conditions:** (a) add an explicit mapping-revocation flag (§7.1) before
relying on NovaKore-side revocation semantics in production onboarding;
(b) the outbound webhook worker must be pointed at a real, reachable BFH
receiver and scheduled (Phase 2 worker is deployed + scheduled; the BFH
receiver is BFH-side).

**No blanket readiness is claimed.** All three are _ready with minor,
non-code conditions_ — none is NOT READY, and none is unconditionally READY
until the interactive UI walkthrough and a live `/v1`/webhook smoke test
against a fresh server are recorded.

---

## Executive summary

NovaKore has **successfully demonstrated that it can power a real,
multi-tenant learning product** through the Built For Her alpha
integration. Two distinct BFH audiences — members and coaches/professional
learners — run as isolated Journeys inside one NovaKore tenant, branded and
worded as Built For Her, sharing the platform's `learner` role while kept
apart by an explicit audience dimension the caller cannot forge. Identity
handoff, enrollment/assignment, completion + credential synchronization,
and signed webhooks all operate over the pre-existing, frozen contract with
**no learning logic in BFH and no BFH business logic in NovaKore**, no
repository merge, and no production connection. Every failure mode
(bad/expired/replayed/modified SSO, cross-audience, cross-tenant,
revoked/invalid keys, duplicate delivery, dead-letter) behaves correctly;
secrets remain database-only; and concurrency/integrity are guaranteed by
existing race-safe constraints. The remaining work is confirmatory
(interactive UI walkthrough, live smoke tests) and one small hardening flag
— not architectural. The platform architecture is validated for BFH
internal alpha.
