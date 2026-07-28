# Event Catalog (Phase 1C)

The 11 registered analytics event types, their emitters, and idempotency
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
  `learning.block.viewed`, `learning.node.unlocked`, `assessment.*`)
  arrive with client telemetry (batch endpoint) and Phase 1D — nothing
  emits them today, so they are not in `EVENT_TYPES` yet.
