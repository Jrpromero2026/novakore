# Manual Review

The subjective-work pathway: short_answer, long_answer, and
file_submission responses.

## 1. Smallest coherent state machine

Review records: `pending_review → in_review → completed` (a claim can be
released back). Attempt statuses stay the single outcome authority:
`pending_review → passed | failed`. The considered statuses
`not_required`, `changes_requested`, `approved`, `rejected` were
deliberately folded away: not_required = no review row exists;
approve/reject = the completed decision; changes_requested (returning
work to the learner for edits) is deferred — it would reopen submitted
responses and needs its own immutability story. Documented here so the
deferral is explicit.

## 2. Flow

1. Submission with any answered subjective item — or an UNANSWERED
   required one — sets the attempt `pending_review` and creates the
   review record (idempotent), emitting `assessment.attempt.pending_review`.
2. `claim_assessment_review` (requires `assessment.grade`; never on your
   own attempt) marks it `in_review` with reviewer + timestamp.
3. `complete_assessment_review` validates every needed score against
   `[0, item points]`, writes per-response `reviewed_points` +
   `reviewer_feedback` and the review's `overall_feedback`, recomputes
   the total (objective grades re-derived deterministically), finalizes
   the attempt against the snapshot threshold, and emits
   `assessment.review.completed` plus the pass/fail event — in one
   transaction. A pass runs the completion cascade and credential
   issuance.

## 3. Authorization and integrity

- `assessment.grade` scopes the queue, detail, claim, and completion;
  organization RLS scopes everything to the tenant.
- **No self-review**: enforced in SQL against the attempt's membership,
  even for permission holders.
- **No author shortcut**: authors hold neither `assessment.publish` nor
  `assessment.grade`; publication and review stay separate duties.
- Completed reviews are terminal: re-review attempts are rejected. Re-
  opening is the future audited `assessment.override` path (documented,
  not yet surfaced).
- Review history: the review row carries claim/completion timestamps and
  reviewer identity; every state change is captured by the standard
  `audit_change` trigger (append-only `audit_logs`), and events/outbox
  rows record the decision.

## 4. Learner-facing outcome

The learner sees status (awaiting review → passed/failed with score),
per-item reviewer feedback, and overall feedback — never the rubric,
never another learner's work.
