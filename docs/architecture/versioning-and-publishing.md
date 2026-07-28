# Versioning and Publishing

How draft content becomes immutable learner-facing versions (ADR-007,
ADR-008, ADR-017). Authority: migrations `20260728203155` /
`20260728203330`; domain schemas in `packages/domain/src/learning.ts`.

## 1. Two worlds, one direction

- **Draft world (mutable).** `courses`, `modules`, `lessons`,
  `content_blocks` — freely editable by holders of `content.author`,
  visible only with `content.view_draft`. Draft edits never touch what
  learners see.
- **Published world (immutable).** `lesson_versions` and
  `course_versions` — created only by the publish RPCs, then frozen.
  UPDATE/DELETE raise `42501` via the `protect_immutable` trigger, direct
  write grants are revoked, and no write policies exist: even
  SECURITY DEFINER code cannot slip past the trigger.

Publishing copies draft → snapshot; nothing ever flows back.

## 2. publish_lesson(p_lesson_id) → lesson_version id

1. Locks the lesson row; requires `content.publish` in the lesson's org;
   refuses archived lessons.
2. Aggregates the draft's `content_blocks` (ordered by position) into a
   JSONB array; refuses empty lessons. The app layer has already
   deep-validated every block against the registry
   (`validateBlockData`); the RPC enforces the structural invariants.
3. Inserts `lesson_versions` with `version_number = max + 1`, the frozen
   `blocks`, title/summary/required/estimated_minutes as of publication.
4. Points `lessons.current_published_version_id` at the new version and
   sets status `published`.
5. Emits `content.lesson.published` (idempotency key
   `lesson-published:<version id>`) in the same transaction.

## 3. publish_course(p_course_id) → course_version id

1. Locks the course row; requires `content.publish`; refuses archived.
2. **Readiness gate:** every non-archived lesson in a non-archived module
   must already have a published version; otherwise the RPC raises with
   the offending lesson titles and **nothing is written** (single
   transaction). The course builder shows the same gate pre-flight.
3. Builds the frozen `structure` (shape: `courseStructureSchema` v1) —
   modules in position order, each lesson entry pinning the **exact**
   `lessonVersionId` + `versionNumber` current at this moment.
4. Inserts `course_versions` with `version_number = max + 1`, the
   course's `completion_rule` snapshot, and `supersedes_version_id`
   pointing at the previous current version.
5. Updates `courses.current_published_version_id`, emits
   `content.course.published`.

Publishing a lesson afterwards does NOT alter existing course versions —
the new lesson version is only picked up by the next course publish.
That asymmetry is the point: a course version is a complete, stable
curriculum artifact.

## 4. Who sees which version

- **Learners** see the version resolved by the ADR-017 pin chain
  (course-progress pin → enrollment pin → current published), rendered
  from the frozen snapshots only. Details:
  [enrollment-and-progress.md](enrollment-and-progress.md).
- **Admins** see drafts, the current published version badge (`v N ·
timestamp`), a draft-vs-published comparison (blocks added/removed/
  changed, title changes) in the lesson editor, and a read-only version
  inspector per course version.

## 5. Snapshot schemas are versioned too

Snapshots carry `schemaVersion` (currently 1). Renderers support all
historical versions forever; snapshot schema changes are additive with
registered migrations, and published rows are never rewritten (ADR-008).
Block-level schema evolution is documented in
[../domain/content-blocks.md](../domain/content-blocks.md).
