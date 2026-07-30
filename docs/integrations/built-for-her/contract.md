# BFH Integration Contract (v1)

All payloads are versioned (`v: 1`) and schema-frozen in
`packages/domain/src/bfh-contract.ts` (typechecked + tested). Additive
evolution only; breaking changes require `v: 2` alongside v1.

## 1. Identity handoff (SSO deep link)

Per ADR-012: short-lived single-use handoff tokens, never sessions.

- BFH requests a handoff for a signed-in member →
  `identityHandoffClaimsSchema`: org slug, `externalUserId`, email,
  optional display name, `accessLevel` (`member|coach|admin`),
  **`audiences` (`member|coach|professional_learner`, ≥1, explicit)**,
  `issuedAt`/`expiresAt` (≤120 s), ≥16-char `nonce`, and an HMAC-SHA256
  `signature` over the canonical claim string with the per-org shared
  secret.
- NovaKore verifies the signature + timing + single-use nonce **inside the
  database** (`bfh_exchange_handoff`; the secret never leaves Postgres),
  links or creates the user via `external_identities`, stores the
  audiences, applies the role + audience mapping (below), refuses a
  disabled/suspended membership, and establishes a NovaKore session.
- Claims carry NO health/performance/subscription data.

### 1a. Persona / audience model (normative)

`accessLevel` is the **BFH app role** (how BFH treats the person);
`audiences` is the **learning audience** (what the person is eligible to
learn). They are independent — NovaKore never infers audience from the app
role. A person holds multiple audiences only through an explicit claim.

| BFH app role              | NovaKore role(s)         | Learning audience(s)               | Assignment eligibility      | Admin perms      | Content visibility        | Credential eligibility         |
| ------------------------- | ------------------------ | ---------------------------------- | --------------------------- | ---------------- | ------------------------- | ------------------------------ |
| `member`                  | `learner`                | `member`                           | member Journeys             | none             | member Journeys only      | member credentials             |
| `coach`                   | `learner` + `instructor` | `coach` (± `professional_learner`) | coach/professional Journeys | instructor scope | coach content (+ serving) | coach/professional credentials |
| `coach`/intern as learner | `learner`                | `professional_learner`             | professional Journeys       | none             | professional content      | professional credentials       |
| `admin`                   | `organization_admin`     | (as claimed)                       | per claimed audiences       | org admin        | oversight                 | n/a                            |

- **Any** audience grants the `learner` role (audiences share the consuming
  role); the app role adds the serving/admin role.
- A Journey carries one `audience_key`; enrollment/assignment is refused
  (`audience_mismatch`) unless the identity holds that audience. Untagged
  Journeys are open to any learner.
- BFH can never mint permissions or audiences outside these bundles.

## 2. Deep-link contract

`https://<novakore-host>/{orgSlug}/learn[/...]?handoff=<token>` —
destinations are canonical NovaKore routes: the learning home, an
enrollment (`/learn/{enrollmentId}`), a course, a lesson, or an
assessment attempt. BFH stores only slugs/ids it received from NovaKore
APIs; it never constructs internal ids. Unknown or unauthorized targets
land on the learning home, never an error page with internal detail.

## 3. Embedded-academy contract (Phase 4, designed now)

Embedding, when it arrives, is an iframe of the same deep-link routes
with the handoff exchange in the top-level context first (no third-party
cookie dependence), a strict `frame-ancestors` allowlist naming BFH's
origins, and postMessage limited to sizing/navigation signals — no data
messages. Until then, deep links open in a first-party tab.

## 4. Inbound APIs (BFH → NovaKore, org-scoped `/v1`)

Auth: per-org API key (ADR-012) with a permission subset; TLS only.

- **Enrollment API** — `enrollmentRequestSchema`: `externalUserId` +
  canonical target (`course` slug | `learning_path` slug) +
  `idempotencyKey`. Creates the enrollment through the same
  `create_enrollment` invariants as the UI (published-version pinning,
  one live enrollment). Also used for withdrawal (future additive
  `action` field; v1 covers create).
- **Learning assignment API** — `assignmentRequestSchema`: assign a
  journey (`pathSlug`) with optional `dueAt` + `idempotencyKey`.

Responses return canonical NovaKore ids/slugs for BFH to store.

## 5. Outbound webhooks (NovaKore → BFH)

Sourced from the transactional outbox (ADR-018) — at-least-once
delivery, BFH dedupes on `eventId` (the analytics event id).

- **Completion webhook** (`learning.completion`): course (with version
  number) or path completion for an `externalUserId`.
- **Assessment-result webhook** (`assessment.result`): assessment slug,
  version number, attempt number, `passed|failed`, `scorePercent`.
  Scores cross the boundary ONLY as percentages — never responses,
  never answers, never rubrics.
- **Credential-issued webhook** (`credential.issued`): title,
  verification code, issue/expiration dates. BFH may render the public
  `/verify/<code>` link; it receives nothing the public page would not
  show plus the member linkage it already owns.

## 6. Signatures

`X-NovaKore-Signature: v1=<hex hmac-sha256(body, endpoint secret)>` +
`X-NovaKore-Timestamp`; receivers MUST reject when |now − timestamp| >
300 s or the signature mismatches (constant-time compare). Secrets are
per-endpoint, rotatable, never logged.

## 7. Errors, retries, idempotency

- Inbound: 4xx = caller error, never retried blindly; 409 on live-state
  conflicts (e.g. already enrolled) with the existing id in the body;
  retries MUST reuse the original `idempotencyKey` and receive the same
  outcome.
- Outbound: outbox worker retry with exponential backoff and a bounded
  attempt budget → dead-letter (operator-visible). BFH endpoint must be
  idempotent on `eventId`. Per-org best-effort ordering only.

## 8. Privacy boundary

Crossing NovaKore→BFH: external user id, canonical content slugs,
version/attempt numbers, outcomes, score percentages, credential
title/code/dates. Never: emails of other members, internal UUID-keyed
learner lists, item content, responses, reviewer feedback, rubrics,
audit data. Crossing BFH→NovaKore: identity claims and
enrollment/assignment commands. Never: health, readiness, nutrition,
workouts, subscription state.

## 9. Versioning

Every payload carries `v`. Additive fields do not bump `v`; renames or
semantic changes ship as a new version delivered alongside the old until
BFH confirms migration. The webhook `type` set is additive-only.
