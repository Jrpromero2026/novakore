# Learning Authorization

Defense-in-depth (ADR-006) as implemented for the learning domain: RLS
for isolation and coarse visibility, SECURITY DEFINER RPCs with internal
deny-by-default checks for every mutation that crosses draft/published or
learner/staff boundaries, and `can()` in the server layer for UI-shaping.
Proven by `packages/database/src/learning-isolation.test.ts` against the
real dev database.

## 1. Grant hygiene (what clients cannot even attempt)

- `anon`: all learning tables revoked entirely.
- `authenticated`: direct INSERT/UPDATE/DELETE revoked on
  `lesson_versions`, `course_versions`, `assessment_versions`,
  `enrollments`, `progress_records`, `analytics_events`; **all** access
  revoked on `outbox_events`. These tables are readable only where RLS
  says so and writable only through RPCs.
- Every RPC re-authorizes internally — EXECUTE grants are not trust.
  `app.emit_event` and `app.evaluate_course_completion` additionally
  revoke EXECUTE from all client roles: events cannot be forged.

## 2. Read policies (RLS)

| Table                                           | Who can SELECT                                                                                                                    |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `learning_systems`, `learning_paths`            | org members see `active`; `content.view_draft` sees all                                                                           |
| `path_nodes`, `prerequisites`                   | members, when the owning path is visible to them                                                                                  |
| `courses`, `lesson_versions`, `course_versions` | `app.can_access_course`: `content.view_draft` OR an active/completed enrollment covering the course (directly or via a path node) |
| `modules`, `lessons`, `content_blocks`          | `content.view_draft` only — drafts are staff-facing; learners read frozen snapshots                                               |
| `assessments`, `assessment_versions`            | `content.view_draft`                                                                                                              |
| `enrollments`                                   | own membership rows; `enrollment.manage` or `progress.view.others` for others                                                     |
| `progress_records`                              | own (via enrollment→membership); `progress.view.others` for others                                                                |
| `analytics_events`                              | `analytics.view`                                                                                                                  |
| `outbox_events`                                 | nobody (no policies — platform-internal)                                                                                          |

`app.can_access_course` is the one shared visibility predicate: learners
see exactly the published artifacts their enrollment covers — including
historical pinned versions after newer ones publish — and nothing else.
Cross-tenant access fails closed everywhere (org-scoped predicates over
`app.is_org_member` / `app.has_org_permission`).

## 3. Write paths

Draft authoring (`courses`, `modules`, `lessons`, `content_blocks`,
paths/systems/nodes/prerequisites) uses ordinary RLS policies:
`content.author` / `paths.manage` with matching WITH CHECK — no RPC
needed because drafts are staff-only and org-scoped.

Everything that crosses a trust boundary is RPC-only:

| RPC                                 | Internal authorization                                                                                                                                                |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `publish_lesson` / `publish_course` | `content.publish` in the row's org; refuses archived; validates readiness atomically                                                                                  |
| `create_enrollment`                 | `assigned` → `enrollment.manage`; `self` → own active membership + `enrollment.self` + target allows self-enrollment                                                  |
| `record_lesson_progress`            | caller owns the enrollment's membership; enrollment active (replays on completed are no-ops); lesson inside the pinned structure; prerequisite gate re-checked in SQL |
| `override_progress`                 | `progress.override` + mandatory reason; recorded with `overridden_by`                                                                                                 |
| `set_enrollment_status`             | `enrollment.manage`; completed enrollments immutable                                                                                                                  |

Spoofing attempts covered by tests: publishing without `content.publish`,
enrolling someone else without `enrollment.manage`, recording another
learner's progress, completing a lesson outside the pinned version,
touching the outbox — all raise `42501`/`23514` and write nothing.

## 4. Immutability as a security property

`lesson_versions` / `course_versions` / `assessment_versions` carry a
BEFORE UPDATE/DELETE trigger that raises unconditionally. Combined with
revoked grants and absent write policies, published evidence cannot be
altered by clients, definer code, or a compromised app layer short of a
migration — "what did the learner see" stays trustworthy.

## 5. Server layer (`can()` + actions)

Server actions check `can()` before calling RPCs and validate all input
with domain schemas — this shapes UX (authors see no publish control;
learners see lock reasons) and keeps garbage out, but is never the last
line: every check above holds even against a caller speaking PostgREST
directly with a stolen session.
