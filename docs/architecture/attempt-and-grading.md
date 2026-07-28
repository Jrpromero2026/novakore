# Attempts and Grading

The learner's transactional path from start to result.

## 1. Attempt lifecycle (single authoritative model)

`started → submitted → (pending_review | passed | failed)`, with
`abandoned` and `expired` as terminal side exits. `submitted` is
transient — grading resolves it inside the same transaction. Enforced by
the RPCs and mirrored by `canTransitionAttempt` in the domain.

`start_assessment_attempt` requires: the caller's own ACTIVE enrollment
covering the assignment's course; an active assignment inside its
availability window; and the retake gate (§4). It snapshots the version,
passing threshold, and time limit, numbers the attempt, and emits
`assessment.attempt.started`. One open attempt per (assignment,
enrollment) — partial unique index.

## 2. Answer privacy

Learner item content flows ONLY through `get_assessment_attempt_payload`
— a constructive allowlist (prompt, instructions, points, option id+text,
maxLength) mirroring the domain's `toLearnerItemView`. Correct-answer
configuration, feedback config, and rubrics are never selected. Raw
`assessment_versions` rows are not learner-readable, responses never
store answer keys, and grading happens after submission server-side —
there is nothing to steal from the client.

## 3. Deterministic grading

`submit_assessment_attempt` is idempotent (re-submission of a
non-started attempt is a no-op) and grades objective items in SQL via
`app.grade_objective_response`, the authoritative twin of the domain's
pure `gradeResponse`:

- `multiple_choice` / `true_false`: exact match → full points or zero.
- `multiple_select`: all-or-nothing by default. Partial credit is opt-in
  per item and documented:
  `points × max(0, (correct − incorrect selections) / total correct)`,
  rounded to 2 dp, full marks only on the exact set.
- Unanswered objective items score zero. Invalid stored responses score
  zero (objective) or still route to review (subjective).

Totals: points earned/possible and percentage (2 dp) stored on the
attempt; pass/fail compares against the snapshot threshold. Objective
per-response grades (`points_earned`, `correct`) are written for
transparency. Regrading safeguards: finalized statuses are terminal;
reopening is a future audited `assessment.override` operation — no
surface mutates a finalized attempt today.

## 4. Retake rules (conservative documented defaults)

From the version's settings snapshot, enforced authoritatively at start
(and mirrored by `computeRetakeEligibility`):

- Open or pending-review attempt → blocked.
- A passed attempt → blocked (passing is terminal per assignment).
- `maxAttempts` (default: unlimited) counts everything except
  `abandoned`; `expired` attempts count.
- `cooldownMinutes` (default 0) from the latest finalization.
- `scorePolicy` default `highest` (records/analytics; passing is
  monotonic so the first pass decides).
- New published versions apply to retakes only via assignment re-pinning
  (assessment-versioning.md §3).
- Failed attempts do not trigger automatic remediation, and reviewer
  approval is not required before retry (both future policy hooks).

## 5. Time limits (safe foundation)

- `timeLimitMinutes` lives in the version settings; the attempt stores
  `expires_at = started_at + limit` computed by the SERVER clock.
- The client countdown is display only (labeled as such).
- Saves and submissions tolerate 30 seconds of clock skew past
  `expires_at`; beyond that, saves are refused and a submission
  finalizes the attempt as `expired` (no score, counts toward the
  attempt limit, no event — the expired-attempt event arrives with the
  background expiration worker, which Phase 1D defers; the data model is
  already correct for it).

## 6. File submissions — guarded deferral

The `file_submission` item type is fully modeled (MIME allowlist, byte
caps, rubric) but binary upload is deferred: there is no submissions
bucket yet. The learner UI states this plainly and records a bounded
plain-text submission note routed to manual review; no fake upload
control exists anywhere. When the bucket lands it follows the ADR-015
media architecture (private, signed access, MIME/size enforcement, no
SVG execution, no cross-tenant references).

## 7. Completion integration

Passing an attempt whose assignment is `required` +
`completion_effect = 'complete_lesson'` completes the lesson through
`app.apply_assessment_outcome` (pin-chain aware, reviewer-safe), emits
`learning.completion.triggered_by_assessment` plus the standard
lesson-completed event under the SAME idempotency key as the learner
path (exactly-once), and runs the 1C completion cascade — course/path
completion, downstream unlocks, credential issuance. Pending review
never completes anything; failing leaves the lesson incomplete; the
`record_lesson_progress` gate stops learners from self-completing a
gated lesson. Monotonic completion is preserved: outcomes only ever add
progress.
