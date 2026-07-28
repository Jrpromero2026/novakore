# Phase 1D Implementation Report

Completed 2026-07-28. Assessment, review, certificate, credential, and
first-tenant integration foundation.

## 1. Executive status

**Phase 1D is complete.** An organization can create a versioned
assessment, attach it to published learning content through controlled
permissions, have an enrolled learner attempt it against an exact pinned
version, grade objective questions deterministically on the server, route
subjective work through an authorized review, apply passing and retake
rules, trigger completion outcomes, and issue a publicly verifiable
credential — all proven by 225 automated tests (70 new this phase) and a
20-step browser walkthrough on the real development database. The BFH
integration exists as a typechecked, tested contract specification only;
nothing is connected. Phase 2 has not been started.

## 2. Baseline

Phase 1C accepted at `5b5ae43` (155 tests, 11 migrations, clean tree).

## 3. Migrations added (4 — 15 total, local ↔ remote in exact sync)

- `20260728225605_assessment_foundation` — 8 tables, 5 permissions +
  bundles + backfill + `create_system_roles` revision, assessment
  authoring events, credential immutability protection, RLS + grants.
- `20260728225909_assessment_operations` — 11 RPCs + internal grading/
  outcome/issuance functions + the `record_lesson_progress` gate +
  completion-credential hooks.
- `20260728230951_attempt_coverage_fix` — composite-cast defect in
  `start_assessment_attempt` (found by the isolation suite).
- `20260728234014_assigned_assessment_visibility_fix` — column-scoping
  defect in the learner assessment-metadata policy (found by browser QA).

## 4. Tables added (8)

`assessment_items`, `assessment_assignments`, `assessment_attempts`,
`assessment_responses`, `assessment_reviews`, `certificate_templates`,
`certificates`, `issued_credentials` — each with UUID keys, org scoping,
lifecycle state, timestamps, creator attribution where applicable,
explicit FKs, uniqueness + CHECK constraints, tenant-path indexes, and
`audit_change` triggers. `assessment_feedback` and sections were
deliberately not created (documented: feedback lives on
responses/reviews; fractional-index ordering covers structure).

## 5. Item types (6, versioned Zod discriminated unions)

`multiple_choice`, `multiple_select`, `true_false`, `short_answer`,
`long_answer`, `file_submission` (guarded upload deferral — plain-text
submission note; no fake upload anywhere). Each defines prompt,
instructions, required state, points, correct-answer config (objective),
feedback config, rubric (subjective), accessibility-labeled editors and
learner fields, `schemaVersion: 1`, and a registered stepwise migration
path. Matching/ordering/video and richer types deferred.

## 6. Versioning behavior

Publication freezes registry-validated items + settings into immutable
`assessment_versions` (`assessment.publish` required; invalid items block
publication app-side before the RPC). Attempts pin
`assessment_version_id`; responses bind to item UUIDs inside that
snapshot; thresholds and time limits are per-attempt snapshots. Draft
edits never mutate history. Assignments pin at attach; re-pinning is
archive-and-attach. Diff display keys on stable item UUIDs (the 1C jsonb
key-order lesson applied; per-field diff deferred).

## 7. Grading behavior

Server-authoritative and deterministic (`app.grade_objective_response`,
pure domain twin `gradeResponse`): exact-match MC/TF; multiple_select
all-or-nothing with documented opt-in partial credit
(`points × max(0,(right−wrong)/total right)`, 2 dp, full marks only on
the exact set). Correct answers never reach the learner client — the
payload RPC is a constructive allowlist, proven by DOM inspection, DB
tests, and unit tests. Points/percentages stored per response and per
attempt; idempotent finalization; single `attempt-finalized` event key
across both finalization paths; finalized attempts are terminal
(reopening = future audited `assessment.override`).

## 8. Review workflow

`pending_review → in_review → completed` review records over
`pending_review → passed|failed` attempts. `assessment.grade` gates
queue/claim/complete; self-review is blocked in SQL regardless of
permissions; scores validated against per-item maxima; per-item +
overall feedback stored and shown to the learner after decision;
completed reviews are terminal; `changes_requested` deferred with
documentation.

## 9. Retake behavior (conservative documented defaults)

Blocked by open/pending/passed attempts; `maxAttempts` (default
unlimited) counts everything except `abandoned`; `cooldownMinutes`
(default 0) from last finalization; `scorePolicy` default `highest`;
new versions apply only via assignment re-pinning; no auto-remediation,
no reviewer-approval-to-retry (future hooks). Enforced in the start RPC,
mirrored by `computeRetakeEligibility`.

## 10. Completion integration

Required + `complete_lesson` assignments own their lesson's completion:
learner self-complete is rejected by the `record_lesson_progress` gate
(UI replaces the button with an explanation); a passed attempt completes
the lesson through the pin chain, emits
`learning.completion.triggered_by_assessment` plus the standard
lesson-completed event under the same idempotency key (exactly-once),
and runs the 1C cascade — course completion, path completion, unlocks,
credential issuance. Pending review completes nothing; monotonic
completion preserved. Verified live in both tenants.

## 11. Certificates and credentials

Template (constrained plain-text schema) → certificate rule (one active
per explicit source: course / path / assignment) → issued credential
(immutable evidence: recipient + template snapshots, evidence pins,
`NVK-XXXX-XXXX-XXXX-XXXX` 64-bit verification code, lazy expiration) →
public verification (`/verify/[code]` + anon `verify_credential`,
privacy-safe fields only). Issuance is automatic on completion/pass and
idempotent (partial unique + conflict-guarded event); manual issuance
requires `credential.issue`; revocation requires `credential.revoke` +
reason, is permanent, audited, idempotent, and publicly visible.

## 12. Permission catalog changes (24 → 29)

`assessment.publish` (owner/admin/academy admin/reviewer),
`assessment.assign` (owner/admin/academy admin), `assessment.override`
(owner/admin — reserved for the future regrade surface),
`credential.issue`, `credential.revoke` (owner/admin). Seeds, existing-
org backfill, and the `create_system_roles` revision shipped in ONE
migration, and a new parity test proves the LATEST seed function grants
the owner bundle every catalog permission — the Phase 1C
progress.override defect class is now structurally impossible. Matrix:
[../permissions/permission-matrix.md](../permissions/permission-matrix.md).

## 13. RLS summary

Draft items staff-only (they carry answer keys); assignments visible via
`can_access_course`; published+assigned assessment METADATA readable by
covered learners (the QA-fixed policy); attempts/responses/reviews:
owner or `assessment.grade`/`progress.view.others`; templates/rules:
`certificates.manage`; issued credentials: recipient or managers;
attempts/responses/reviews/credentials have zero client write grants
(RPC-only); issued credentials additionally field-protected by trigger.
All 20 required proofs pass in
`assessment-isolation.test.ts` (24 tests, real DB, zero mocks).

## 14. Event and outbox chain

13 new registered types (24 total) in the frozen three-segment taxonomy,
all emitted via `app.emit_event` in-transaction with deterministic keys
([../domain/event-catalog.md](../domain/event-catalog.md)). QA verified
the live chains end-to-end: for every relevant type, events = distinct
idempotency keys = outbox rows (exactly-once), across submissions,
review finalization, replays, completion cascades, and issuance.
`credential.certificate.expired` intentionally unregistered until the
expiration worker exists.

## 15. BFH development tenant

`bfh-dev` extended with seed fixtures only: two published assessments
(objective check on the Movement Screening lesson; subjective evaluation
on the Client Intake lesson), an active certificate template + course-
sourced certificate rule. QA validated the full journey: objective
attempt → immediate 100% pass; subjective attempt → pending review →
coach review → pass → lesson → program → journey completion → automatic
credential issuance — all under the Journey/Program/Evaluation
terminology overlay. No production users, subscriptions, health data, or
BFH databases touched.

## 16. BFH integration contract

Specification complete under
[../integrations/built-for-her/](../integrations/built-for-her/README.md):
ownership boundary (NovaKore owns learning/assessment/credential truth;
BFH owns subscriptions/training/health), tenant + user mapping, access-
level claims, enrollment + assignment APIs, three webhook types,
deep-link and embedded-academy contracts, signature/retry/idempotency
rules, environments, rollout sequence, explicit deferrals. Payload
schemas are typechecked and tested (`bfh-contract.ts`). Implementation
deferred; nothing connected.

## 17. Admin UI

Assessment list + create; structured editor (typed fields per item type,
live domain validation with inline invalid feedback, draft/published
badges, distinct publish control, settings bounds); version-pinned
assignment panel with archive; attempts list; review queue + detail
(rubric display, bounded scoring, feedback, claim); credential admin
(templates, rules, issued list, reasoned revoke). Three permission-gated
nav items. No fake analytics, no dashboard theater, no design canvas.

## 18. Learner UI

Lesson assessment entry with required-gating; attempt flow on the
answer-stripped payload (keyboard-accessible typed inputs, save-on-
answer, display-only countdown labeled as such, guarded file-submission
deferral); submission confirmation; pending-review / passed / failed /
expired states with retake eligibility; reviewer feedback display;
credentials on the learning home with verification links; public
verification page. No correct-answer leakage (DOM-verified), no
browser-enforced time authority.

## 19. Test totals (225 — all passing)

- **Domain 81** (+31): item schemas, migrations, learner-view stripping,
  response validation, grading incl. partial credit, attempt outcome,
  state machines, retakes, settings/template schemas, credential status,
  verification format, event additions, BFH contract, future-org parity.
- **Authorization 9**: catalog + role mapping (extended by parity).
- **Database 73** (+24): the full isolation/integrity suite (§13) plus
  all 49 Phase 1A–1C proofs still green.
- **Web 62** (+14): editor validation + publish gating + pin display,
  attempt flow states + leakage check + countdown labeling + guarded
  deferral, review form bounds, plus all prior suites.

## 20. Browser QA (20 steps, real novakore-dev)

All 20 steps passed across owner, author, publisher, reviewer,
instructor, learner, and the multi-organization user: draft authoring →
author publish denial → publish v1 → version-pinned attach → enrollment
→ attempt → server grading (50% partial → 90% after review) → pending
review → review → pass → gated-lesson completion → enrollment completion
→ BFH objective pass (100%) → BFH review flow → journey completion →
automatic credential → anonymous verification → cross-tenant 404 →
XSS probes (prompt, response, feedback — all inert) → exactly-once event
chain (SQL-verified). Two defects found and fixed (§3 fix migrations +
the /verify proxy allowlist); the hidden-pane environment workarounds
from 1B/1C applied throughout (not app defects).

## 21. Security findings

Inspected per the phase checklist: no correct-answer leakage (payload
allowlist + RLS + DOM proof); no client-side grading trust; attempt
tampering blocked (ownership + status + revoked grants); submitted
responses immutable; cross-tenant attempt access impossible; reviewer
overreach blocked (self-review + org scoping); unauthorized publishing
blocked at the RPC; credential forgery blocked (definer-only issuance,
format-checked codes, field-protection trigger); verification-ID
enumeration resisted (64-bit random space + strict input check; note:
no rate limiting on the anon RPC — acceptable at dev scale, revisit
before production); stored XSS inert at every probe point; no unsafe
file handling (uploads deferred, not faked); no open redirects; service-
role key still never obtained; no duplicate events (verified); future-
org permissions structurally guaranteed; time-limit bypass prevented
(server clock + skew-bounded grace). One new intentional advisor WARN:
anon-executable `verify_credential` (the documented public surface).

## 22. Manual environment items (reported, not changed)

- Leaked-password protection: **still OFF** (advisor-confirmed; owner
  dashboard toggle).
- SMTP: Supabase built-in, unchanged.
- Storage CORS: defaults, nothing required them — unverified.
- Production auth providers: none configured; magic-link flow not
  exercised this phase.
- Docker still absent; remote-dev testing remains the documented path.

## 23. Deferred items

Production BFH connection/SSO/webhook dispatcher, AI grading/generation/
tutor, advanced competency engine, adaptive assessment, proctoring/
anti-cheat, payment gating, marketplace, blockchain, SCORM/LTI/HRIS,
native mobile, production email/certificate delivery, production
Supabase project. Also: binary file uploads (guarded), background
expiration worker + expired-event, `changes_requested` review loop,
`assessment.override` regrade surface, per-field item diff, verification
rate limiting, assignment targets beyond lessons.

## 24. Commits

`ba994bf` (domain + foundation migration), `7596529` (operations
migration), `6225195` (isolation tests + seeds + coverage fix),
`dd02966` (surfaces), `802305f` (contract + docs), `3bee028` (QA fixes),
plus this report.

## 25. npm run verify

Green end-to-end at the final tree: format:check, lint (0 problems),
typecheck (4 workspaces), 225 tests, production build (30 routes +
proxy).

## 26. Repository status

Working tree clean at the report commit; migrations 15/15 local↔remote;
generated types current; seeds idempotent (re-applied without error);
no credentials committed; BFH and G3 repositories untouched; no
production Supabase project exists.

## 27. Owner actions required

1. Enable leaked-password protection (dashboard) when ready.
2. Review ADR-019 and the retake/passing defaults (70% pass, unlimited
   attempts, no cooldown) — adjust org defaults if desired.
3. The QA fixtures created this phase (QA 1D Course/Safety Check in
   Alpha; the completed BFH journey + issued credential) remain in
   novakore-dev as living examples — say the word to prune them.

## 28. Decisions required before Phase 2

- AI provider + budget approval (ADR-010 precondition).
- Submissions bucket go-ahead (unlocks real file uploads).
- Outbox worker scheduling home (unlocks webhooks + expiration events).
- Public verification exposure policy (custom domain? rate limiting?)
  before any production project exists.
- Whether academy-scoped delegation of credential/override permissions
  is wanted (currently owner/admin only).

Phase 2 has not been started.
