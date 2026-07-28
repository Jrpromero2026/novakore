# Prerequisites and Unlocks

How "what can this learner open right now?" is decided — once, in one
place, deterministically (ADR-009 Phase 1 scope).

## 1. Two levels of gating

- **Within a course:** sequence gating over the pinned structure.
  Required lessons unlock in position order; a lesson is available once
  every required lesson before it is `completed`/`exempted`. Optional
  lessons never block later ones.
- **Within a path:** prerequisite edges between `path_nodes` (courses).
  A node is available when every edge's required node's course is
  completed. Phase 1C supports only `requirement = 'completed'`
  (CHECK-enforced) — the typed condition-tree upgrade path is ADR-009's
  Phase 3 concern.

## 2. The single computation (domain package)

`computeLessonAccess` and `computePathAccess` in
`packages/domain/src/learning.ts` are THE implementations. They are pure
(no I/O), take the pinned structure/nodes + progress, and return per-item
`{ state, reason }`:

- Lesson states: `available | completed | locked_by_sequence |
not_enrolled | version_unavailable`.
- Node states: `available | completed | locked_by_prerequisite |
not_enrolled`.
- Locked states carry a human-readable reason (`Complete "X" first.`)
  which surfaces render verbatim — learners always see _why_, and the
  admin inspection view shows the same truth.

Withdrawn/expired enrollments map every item to `not_enrolled`.
No surface, action, or test re-implements any of this logic.

## 3. Authoritative enforcement (database)

UI gating alone is not security. The database independently enforces:

- **Prerequisite gate:** `record_lesson_progress` re-checks unmet
  prerequisites in SQL for path enrollments and raises `42501` — a
  learner poking the RPC directly cannot bypass a lock.
- **Sequence integrity:** progress is only recordable against lessons in
  the enrollment's pinned structure.
- **Cycle prevention:** a `BEFORE INSERT OR UPDATE` trigger on
  `prerequisites` walks the edge graph with a recursive CTE and rejects
  any edge that would make a node reach itself (errcode `23514`);
  self-edges are CHECK-blocked. This is the authority; the domain's
  `wouldCreateCycle` is a pure mirror used for immediate authoring
  feedback. Both are tested (real-DB rejection + property cases).

## 4. Why sequence gating is not in SQL

Within-course sequencing depends only on the pinned snapshot plus the
learner's own progress rows — both immutable or self-owned — so
computing it in the domain layer is deterministic and cheap, and the RPC
re-derives the same facts where it matters (version membership,
prerequisite edges). If a hard within-course gate ever becomes a
compliance requirement, it slots into `record_lesson_progress` beside
the prerequisite gate without schema change.
