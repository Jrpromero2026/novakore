# Enrollment and Progress

The learner-state half of the learning engine: who is enrolled in what,
against which exact version, and what evidence exists (ADR-017; RPCs in
migration `20260728203330`, idempotency refinement in `20260728204351`).

## 1. Enrollments

`enrollments` links an organization **membership** (not a bare user) to a
`course` or `learning_path` target. Key columns:

- `target_type` + exactly one of `course_id` / `learning_path_id`
  (CHECK-enforced).
- `pinned_course_version_id` — required for course targets (ADR-017).
- `status`: `active | completed | withdrawn | expired`; `source`:
  `assigned | self`; `assigned_by`, `started_at`, `due_at`,
  `completed_at`.
- Partial unique indexes allow only one live (`active`/`completed`)
  enrollment per membership per target — re-enrollment after withdrawal
  is possible, duplicates are not.

All writes go through RPCs (direct INSERT/UPDATE grants are revoked):

- **`create_enrollment(membership, target_type, target_id, source)`** —
  `assigned` requires `enrollment.manage`; `self` requires the caller to
  own the membership, hold `enrollment.self`, and the target to allow
  self-enrollment. Course targets must have a published version, which is
  pinned at creation. Emits `enrollment.learner.enrolled`.
- **`set_enrollment_status(enrollment, status)`** — withdraw/expire/
  reactivate with `enrollment.manage`. Completed enrollments are evidence
  and can never change status. Emits `enrollment.learner.withdrawn`.

## 2. Progress records

`progress_records` is the evidence table: one row per
`(enrollment, lesson)` and one course-level row per
`(enrollment, course)` (partial unique indexes). Every row pins exact
versions: lesson rows carry `lesson_version_id` + `course_version_id`;
course rows carry `course_version_id`. Status is
`in_progress | completed | exempted`; an absent row means "not started"
— no null-status overloading.

### record_lesson_progress(enrollment, lesson, action)

The learner's only write path (`action` ∈ `start | complete`):

1. Caller must own the enrollment's membership (active), and the lesson's
   course must be covered by the enrollment (directly or via a path
   node); path nodes are additionally prerequisite-gated in SQL — the
   authoritative twin of `computePathAccess`.
2. First contact with a course creates the course-level row, resolving
   the ADR-017 pin chain (enrollment pin → current published) and
   emitting `learning.course.started`; `enrollments.started_at` is set
   once.
3. The lesson must exist inside the **pinned** structure; its exact
   `lessonVersionId` comes from that snapshot — a learner can never
   record progress against a version they were not assigned.
4. `start` inserts an `in_progress` row (no-op if any row exists);
   `complete` upserts to `completed`. Replays are idempotent: completing
   an already-completed/exempted lesson (including on a `completed`
   enrollment) changes nothing and emits nothing. Withdrawn/expired
   enrollments are rejected; _new_ progress requires `active`.
5. Completion cascade: `app.evaluate_course_completion` re-evaluates the
   course-level row against the pinned version's `completion_rule`
   (`all_required_lessons` or `percentage_of_required_lessons` —
   bounded, versioned; domain mirror `isCourseComplete`). Course
   completion emits `learning.course.completed`, completes course-target
   enrollments (`enrollment.learner.completed`), and for path targets
   completes the enrollment when every node's course is complete
   (`learning.path.completed`).

### override_progress(enrollment, lesson, status, reason)

Manual override is a distinct, audited act: requires the
`progress.override` permission (owner/admin by default), a reason (≥ 5
chars, stored on the row with `overridden_by`), targets `completed` or
`exempted`, pins versions exactly like the learner path, emits
`learning.progress.overridden`, and runs the same completion cascade.
`exempted` counts as satisfied for sequencing and completion.

## 3. Reading progress

Learners read their own enrollments/progress via RLS (membership match);
staff need `progress.view.others` (or `enrollment.manage` for enrollment
lists). The web layer (`lib/data/learning.ts`) resolves the pin chain and
delegates all availability decisions to `computeLessonAccess` /
`computePathAccess` — surfaces render returned states and reasons
verbatim ([prerequisites-and-unlocks.md](prerequisites-and-unlocks.md)).
