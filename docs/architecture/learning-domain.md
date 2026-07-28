# Learning Domain (Phase 1C)

The implemented learning engine: what exists, where each responsibility
lives, and which invariants are load-bearing. Companion docs:
[versioning-and-publishing.md](versioning-and-publishing.md),
[enrollment-and-progress.md](enrollment-and-progress.md),
[prerequisites-and-unlocks.md](prerequisites-and-unlocks.md),
[transactional-outbox.md](transactional-outbox.md),
[../security/learning-authorization.md](../security/learning-authorization.md).

## 1. Entities (12 tables, migration `20260728203155`)

| Table              | Role                                            | Mutability                   |
| ------------------ | ----------------------------------------------- | ---------------------------- |
| `learning_systems` | Academy-scoped governed frameworks              | draft/active/archived        |
| `learning_paths`   | Sequenced course graphs inside a system         | draft/active/archived        |
| `path_nodes`       | Ordered course entries in a path                | insert/delete                |
| `prerequisites`    | Completion edges between path nodes             | insert/delete, cycle-guarded |
| `courses`          | Org-owned canonical units                       | draft rows editable          |
| `modules`          | Structural containers inside a course           | draft rows editable          |
| `lessons`          | Draft containers of ordered blocks              | draft rows editable          |
| `content_blocks`   | Typed draft blocks (ADR-008 registry)           | draft rows editable          |
| `lesson_versions`  | Frozen validated block arrays                   | **immutable**                |
| `course_versions`  | Frozen structure pinning exact lesson versions  | **immutable**                |
| `enrollments`      | Learner ↔ course/path, pinned version (ADR-017) | RPC-only writes              |
| `progress_records` | Evidence pinned to exact versions               | RPC-only writes              |

Plus `assessments`/`assessment_versions` (durable minimum for Phase 1D)
and `analytics_events`/`outbox_events` (ADR-018). Every table carries
`organization_id` (ADR-004) and RLS; orderable children use
fractional-index positions (ADR-014).

## 2. Layering — who is allowed to decide what

1. **Database (authoritative invariants).** Immutability triggers on
   `*_versions`; the recursive-CTE cycle trigger on `prerequisites`;
   CHECK constraints (version pins present, status/subject coherence);
   partial unique indexes (one live enrollment per target, one progress
   row per lesson per enrollment); six SECURITY DEFINER RPCs that
   re-authorize internally and emit events transactionally.
2. **`@novakore/domain` (single computation source).** `learning.ts`
   owns the snapshot schemas (`courseStructureSchema`,
   `completionRuleSchema`, `lessonBlocksSnapshotSchema`) and THE
   deterministic computations every surface uses:
   `computeLessonAccess`, `computePathAccess`, `isCourseComplete`,
   `wouldCreateCycle` (pure mirror of the DB trigger for authoring UX),
   plus the event catalog and envelope schema. No surface re-implements
   unlock logic.
3. **Web data/actions layer.** `apps/web/src/lib/data/learning.ts` reads
   under the caller's RLS session and feeds domain computations;
   `lib/actions/learning.ts` validates with domain schemas, checks
   `can()`, then calls the RPCs. UI state is never authorization
   (ADR-006).
4. **Surfaces.** Admin authoring/enrollment surfaces and the learner
   `/learn` area render domain outputs (states + human reasons) and the
   one safe block renderer.

## 3. Invariants proven by tests

- Published versions are immutable even via definer-code paths
  (trigger raises `42501`).
- A prerequisite insert that would create a cycle is rejected by the
  database, not just the UI.
- Learners can only write their own progress, only inside their
  enrollment's pinned structure, and replayed completions are no-ops
  (idempotent, no duplicate events).
- Cross-tenant reads/writes fail at RLS; `outbox_events` is invisible to
  every client role.
- Publishing a course fails atomically when any lesson lacks a published
  version — nothing is written.

Suites: `packages/database/src/learning-isolation.test.ts` (real dev DB),
`packages/domain/src/learning.test.ts`, plus web component tests for
permission-gated publishing, lock reasons, and pinned-version display.

## 4. Explicitly not in Phase 1C

Assessment engine (1D), rules engine beyond prerequisites (ADR-009),
outbox worker (deferred with contract), enrollment version-migration
tooling (ADR-017 future op), client-emitted telemetry events.
