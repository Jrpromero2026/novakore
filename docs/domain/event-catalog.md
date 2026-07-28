# Event Catalog (Phase 1C–1D)

The 24 registered analytics event types, their emitters, and idempotency
keys. Envelope + taxonomy rules:
[../architecture/analytics-and-events.md](../architecture/analytics-and-events.md);
transport: [../architecture/transactional-outbox.md](../architecture/transactional-outbox.md).
Type list is code: `EVENT_TYPES` in `packages/domain/src/learning.ts`
(the envelope schema rejects unregistered types).

All Phase 1C events are **server-authoritative**, emitted by
`app.emit_event` inside the RPC transaction that caused them. `context`
carries the resolution chain (exact version ids where applicable);
`actor_user_id` is the authenticated caller.

| Type                           | Subject       | Emitted by                        | Context highlights                                       | Idempotency key                                     |
| ------------------------------ | ------------- | --------------------------------- | -------------------------------------------------------- | --------------------------------------------------- |
| `enrollment.learner.enrolled`  | enrollment    | `create_enrollment`               | target type/id, pinned course version                    | `enrollment-created:<enrollment>`                   |
| `enrollment.learner.completed` | enrollment    | completion cascade                | course_version_id                                        | `enrollment-completed:<enrollment>`                 |
| `enrollment.learner.withdrawn` | enrollment    | `set_enrollment_status`           | —                                                        | `enrollment-withdrawn:<enrollment>:<epoch>`         |
| `learning.course.started`      | course        | first progress in a course        | enrollment_id, course_version_id                         | `course-started:<enrollment>:<course>`              |
| `learning.course.completed`    | course        | completion cascade                | enrollment_id, course_version_id                         | `course-completed:<enrollment>:<course>`            |
| `learning.lesson.started`      | lesson        | `record_lesson_progress` start    | enrollment, lesson_version_id, course_version_id         | `lesson-started:<enrollment>:<lesson>`              |
| `learning.lesson.completed`    | lesson        | `record_lesson_progress` complete | enrollment, lesson_version_id, course_version_id         | `lesson-completed:<enrollment>:<lesson>`            |
| `learning.path.completed`      | learning_path | completion cascade                | enrollment_id                                            | `path-completed:<enrollment>`                       |
| `learning.progress.overridden` | lesson        | `override_progress`               | enrollment, lesson_version_id, new status; `data.reason` | `progress-overridden:<enrollment>:<lesson>:<epoch>` |
| `content.lesson.published`     | lesson        | `publish_lesson`                  | lesson_version_id, course_id; `data.version_number`      | `lesson-published:<version>`                        |
| `content.course.published`     | course        | `publish_course`                  | course_version_id; `data.version_number`                 | `course-published:<version>`                        |

Phase 1D additions:

| Type                                          | Subject               | Emitted by                                   | Context highlights                           | Idempotency key                                |
| --------------------------------------------- | --------------------- | -------------------------------------------- | -------------------------------------------- | ---------------------------------------------- |
| `content.assessment.created`                  | assessment            | insert trigger                               | `data.assessment_type`                       | `assessment-created:<assessment>`              |
| `content.assessment.updated`                  | assessment            | update trigger (title/settings/type only)    | —                                            | `assessment-updated:<assessment>:<epoch>`      |
| `content.assessment.published`                | assessment            | `publish_assessment`                         | assessment_version_id; `data.version_number` | `assessment-published:<version>`               |
| `assessment.assignment.created`               | assessment_assignment | `assign_assessment`                          | lesson, assessment, pinned version           | `assessment-assigned:<assignment>`             |
| `assessment.attempt.started`                  | assessment_attempt    | `start_assessment_attempt`                   | assignment, enrollment, pinned version       | `attempt-started:<attempt>`                    |
| `assessment.attempt.submitted`                | assessment_attempt    | `submit_assessment_attempt`                  | version, enrollment                          | `attempt-submitted:<attempt>`                  |
| `assessment.attempt.pending_review`           | assessment_attempt    | submit (subjective work)                     | version                                      | `attempt-pending-review:<attempt>`             |
| `assessment.attempt.passed` / `.failed`       | assessment_attempt    | finalization (submit OR review — never both) | version, enrollment; `data.score_percent`    | `attempt-finalized:<attempt>`                  |
| `assessment.review.completed`                 | assessment_attempt    | `complete_assessment_review`                 | version; `data.decision`                     | `review-completed:<review>`                    |
| `credential.certificate.issued`               | issued_credential     | `app.issue_credential_internal`              | certificate, membership, attempt             | `credential-issued:<certificate>:<membership>` |
| `credential.certificate.revoked`              | issued_credential     | `revoke_credential`                          | certificate; `data.reason`                   | `credential-revoked:<credential>`              |
| `learning.completion.triggered_by_assessment` | lesson                | `app.apply_assessment_outcome`               | enrollment, attempt, assessment version      | `assessment-completion:<attempt>`              |

The pass/fail pair shares ONE key (`attempt-finalized:<attempt>`): an
attempt finalizes exactly once, through either the objective or the
review path. Assessment-driven lesson completion reuses the learner
path's `lesson-completed:<enrollment>:<lesson>` key, so a lesson
completion is exactly-once regardless of which path caused it.
`credential.certificate.expired` is intentionally NOT registered —
expiration is lazy (no worker yet); the type ships with the worker.

Key design notes:

- **Once-ever events** key on the immutable id (version id, enrollment
  id): replays can never duplicate them. **Repeatable acts** (withdraw,
  override) include a timestamp — each occurrence is a distinct fact.
- Idempotent RPC replays (e.g. re-completing a lesson) short-circuit
  before emission — no event, no outbox row (verified by the isolation
  suite).
- The catalog is additive-only. New types register in `EVENT_TYPES`
  (envelope schema), this table, and the taxonomy table in the analytics
  doc. Types follow `<domain>.<subject>.<verb-past>` (CHECK-enforced at
  the table).
- Planned-not-implemented types from the taxonomy (e.g.
  `learning.block.viewed`, `learning.node.unlocked`,
  `credential.certificate.expired`) arrive with client telemetry and the
  background workers — nothing emits them today, so they are not in
  `EVENT_TYPES` yet.
