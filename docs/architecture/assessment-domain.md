# Assessment Domain (Phase 1D)

The implemented assessment engine: entities, layering, and load-bearing
invariants. Companions: [assessment-versioning.md](assessment-versioning.md),
[attempt-and-grading.md](attempt-and-grading.md),
[manual-review.md](manual-review.md),
[certificates-and-credentials.md](certificates-and-credentials.md).

## 1. Entities (migrations `20260728225605` / `20260728225909`)

| Table                    | Role                                                      | Mutability                 |
| ------------------------ | --------------------------------------------------------- | -------------------------- |
| `assessments`            | Draft container: title, type, settings                    | draft/published/archived   |
| `assessment_items`       | Typed draft questions (registry-validated)                | draft rows editable        |
| `assessment_versions`    | Frozen validated item arrays + settings snapshot          | **immutable** (1C trigger) |
| `assessment_assignments` | Pins an exact published version to a lesson               | RPC-only writes            |
| `assessment_attempts`    | Evidence: exact version, snapshots, scores                | RPC-only writes            |
| `assessment_responses`   | One row per (attempt, item); never holds answers-key data | RPC-only writes            |
| `assessment_reviews`     | One review record per attempt                             | RPC-only writes            |
| `certificate_templates`  | Constrained plain-text template schema                    | RLS authoring              |
| `certificates`           | Issuance rules (template + source)                        | RLS authoring              |
| `issued_credentials`     | Immutable evidence + public verification code             | RPC-only; field-protected  |

`assessment_feedback` from the entity wishlist is deliberately NOT a
table: per-item reviewer feedback lives on `assessment_responses`
(`reviewer_feedback`, `reviewed_points`) and attempt-level feedback on
`assessment_reviews.overall_feedback` — a separate table would have been
a redundant join for the same facts. Sections are likewise deferred:
fractional-index item ordering covers Phase 1D structures without a
container entity.

## 2. Layering

1. **Database (authoritative).** Immutability triggers; deny-by-default
   SECURITY DEFINER RPCs (`publish_assessment`, `assign_assessment`,
   `start_assessment_attempt`, `save_assessment_response`,
   `submit_assessment_attempt`, `claim/complete_assessment_review`,
   `issue_credential`, `revoke_credential`, `verify_credential`);
   server-side deterministic grading (`app.grade_objective_response`);
   the answer-stripped learner payload
   (`get_assessment_attempt_payload`); the lesson completion gate
   (`app.lesson_requires_assessment_pass` inside
   `record_lesson_progress`).
2. **`@novakore/domain`** (`assessment.ts`): item/response/settings/
   template schemas, `gradeResponse` + `computeAttemptOutcome` (the pure
   twins of the SQL grading), attempt/review state machines,
   `computeRetakeEligibility`, `toLearnerItemView` (the ONLY learner
   shape), credential status with lazy expiration.
3. **Web layer.** Actions deep-validate items/settings/responses against
   the registry before any RPC; `can()` shapes the UI; learner item
   content only ever arrives via the stripped RPC payload.

## 3. Invariants proven by tests

- Correct-answer configuration never reaches a learner: the payload is a
  constructive allowlist and raw `assessment_versions` rows are not
  learner-readable (real-DB + web + domain tests).
- Published assessment versions are immutable for every client role.
- Grading is deterministic and server-side; learners cannot grade,
  finalize, or review their own attempts.
- Submitted responses are locked (RPC refuses; direct writes have no
  grants).
- A lesson with a required completing assessment cannot be
  self-completed — the gate raises inside `record_lesson_progress`.
- Attempts, responses, reviews, and credentials are tenant-isolated and
  owner-scoped; suspended/removed members lose all access.
- Every event in the chain emits exactly once across replays.

Suites: `packages/database/src/__tests__/assessment-isolation.test.ts`
(24 real-DB tests), `packages/domain/src/assessment.test.ts` (30),
plus 14 targeted web tests.

## 4. Explicitly not in Phase 1D

AI grading/generation, adaptive assessment, proctoring/anti-cheat,
matching/ordering/video item types, binary file uploads (guarded
deferral — see attempt-and-grading.md §5), background expiration worker,
production BFH connection.
