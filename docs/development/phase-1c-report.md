# Phase 1C Implementation Report

Completed 2026-07-28. Learning engine: schema, transactional operations,
domain computations, authoring + delivery surfaces, events/outbox, and
documentation. Baseline: Phase 1B complete (109 tests, clean tree at
`4a5b6d4`).

## 1. Decisions

- **ADR-017 — pin-at-enrollment (amends ADR-007):** course enrollments pin
  the exact published version at creation; path enrollments pin per-course
  at first start; no silent migration of active learners. Read/write paths
  resolve course-progress pin → enrollment pin → current published.
- **ADR-018 — analytics table + transactional outbox:** every learning RPC
  emits its analytics event and outbox row via `app.emit_event` inside the
  same transaction as the state change; deterministic idempotency keys;
  `outbox_events` has zero client access; worker deferred with a written
  processing contract; partitioning deferred with a written playbook.

## 2. Delivered

| Area            | Result                                                                                                                                                                                                                                                                                                 |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Schema          | 16 new tables (12 learning + assessments durable minimum + analytics/outbox), RLS on all, immutability triggers on every `*_versions`, recursive-CTE prerequisite cycle trigger, partial unique indexes for one-live-enrollment and one-progress-row rules.                                            |
| Operations      | `app.emit_event` + 6 SECURITY DEFINER RPCs (`publish_lesson`, `publish_course`, `create_enrollment`, `record_lesson_progress`, `override_progress`, `set_enrollment_status`), each with internal deny-by-default authorization and transactional emission.                                             |
| Domain engine   | Versioned snapshot schemas, bounded completion rules, THE single unlock computations (`computeLessonAccess` / `computePathAccess`) with human-readable lock reasons, `isCourseComplete`, `wouldCreateCycle`, 11-type event catalog + envelope schema.                                                  |
| Blocks          | 9 validated block types (registry + migrations, callout v1→v2 reference case); escape-first renderer — text only ever reaches the DOM as React text nodes; no `dangerouslySetInnerHTML` in the codebase; no iframes; `https:`-only links.                                                              |
| Admin surfaces  | Learning systems/paths manager (nodes, prerequisites with live cycle feedback), course catalog + builder (reorder, publish panel pinning exact versions), structured lesson editor (typed fields, live validation, draft-vs-published diff), version inspector, enrollment management.                 |
| Learner surface | `/learn` home, path map and course view rendering domain states + reasons verbatim, lesson viewer on frozen snapshots with idempotent start/complete actions and completion celebration.                                                                                                               |
| Permissions     | One addition: `progress.override` (owner/admin bundles; backfill + seed-function revision). Matrix documented in [../permissions/permission-matrix.md](../permissions/permission-matrix.md).                                                                                                           |
| Documentation   | ADR-017/018; five as-built architecture docs (learning-domain, versioning-and-publishing, enrollment-and-progress, prerequisites-and-unlocks, transactional-outbox); domain content-blocks + event-catalog; security learning-authorization; permission matrix; analytics/entity-model/README updates. |

## 3. Database

- Migrations `20260728203155_learning_foundation`,
  `20260728203330_learning_operations`,
  `20260728204351_idempotent_progress_replay`,
  `20260728214840_seed_progress_override` — 11 total, applied to
  novakore-dev via MCP, remote history in exact sync with local files.
- Seeds: Alpha worked example (system → path → 2 courses → 5 lessons →
  published v1 versions → prerequisite edge), BFH journey fixtures with
  full terminology overrides, draft-newer-than-published fixtures, three
  enrollments with partial progress.

## 4. Issues found and fixed by the gates (this phase)

1. **Client-boundary crash (browser QA):** `PathCard.Create` was a static
   attached to a `"use client"` component; statics do not survive the
   server→client reference boundary, so `/admin/learning` rendered
   `undefined` and crashed. Promoted to a module-level export
   (`CreatePathPanel`).
2. **False "changed" diff (browser QA):** the lesson draft-vs-published
   comparison serialized jsonb (normalized key order) against hand-built
   objects (insertion order), flagging every block as changed. Replaced
   with a key-order-independent serializer; seeded fixture now reads
   `+0 added, −0 removed, 0 changed, title changed`.
3. **Seed-function gap (matrix audit):** `progress.override` was granted
   to existing owner/admin roles but `app.create_system_roles` was not
   revised, so future organizations would have missed it. Fixed by
   migration `20260728214840`.
4. **Pluralization nit (browser QA):** learner home showed "1 lessons
   done"; now singular/plural through the terminology resolver.

## 5. Security review (Phase 1C additions)

| Threat                            | Defense (verified by)                                                                                                                                                     |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stored XSS via lesson content     | Finite typed blocks; escape-first renderer; live probe `<script>alert(1)</script>` rendered inert in editor preview AND learner view (browser QA + 6 renderer unit tests) |
| `javascript:`/non-https links     | Schema `https:` refinement + renderer link pattern; never becomes an anchor (unit test)                                                                                   |
| Tampering with published evidence | Immutability trigger + revoked grants + no write policies on all `*_versions` (real-DB test)                                                                              |
| Progress spoofing                 | RPC ownership/membership checks; wrong owner, foreign lesson, suspended member, outside-pinned-version all rejected (real-DB tests)                                       |
| Unauthorized publication          | `content.publish` enforced inside the RPCs, not just UI (real-DB test + author-vs-publisher UI tests)                                                                     |
| Enrollment forgery                | Direct writes revoked; `create_enrollment` enforces manage/self rules + self-enrollment flags (real-DB tests)                                                             |
| Event forgery / phantom events    | `app.emit_event` not client-executable; events only from RPC transactions; idempotency keys dedupe replays (real-DB + QA event-chain check)                               |
| Outbox exposure                   | Zero policies + zero grants; owner read/write both fail (real-DB test)                                                                                                    |
| Prerequisite bypass               | Authoritative SQL gate in `record_lesson_progress` + explainable `42501` (real-DB test; UI shows the same reason)                                                         |
| Draft content leakage to learners | `content.view_draft`-only policies on drafts; learner sees zero rows; draft title change never leaked in learner view (real-DB test + QA)                                 |
| Cross-tenant access               | org-scoped predicates everywhere; suspended/removed members see nothing (real-DB tests)                                                                                   |
| Service-role exposure             | Still never obtained or used anywhere.                                                                                                                                    |

## 6. Verification — 43-point final checklist

Constraints and hygiene:

1. ✅ Built For Her and G3 Performance sibling repositories untouched —
   every change this phase is confined to `C:\Users\JR\novakore`.
2. ✅ No production Supabase project exists or was created; the only
   project used is `novakore-dev` (`mivqjcxpfanfzjkwwxcc`).
3. ✅ Service-role key never obtained; the app runs on the anon key + RLS.
4. ✅ No secrets committed; `.env.test.local` remains gitignored.
5. ✅ Phase 1D not started — assessments exist only as the approved
   durable-minimum tables; no engine, items, attempts, or UI.
6. ✅ Canonical entity names frozen; tenant terminology verified as a
   pure presentation overlay (BFH renders Journey/Program/Phase while all
   data stays canonical).
7. ✅ Migration history: 11 local files ↔ 11 remote versions, names and
   order identical.

Pipeline:

8. ✅ `npm run verify` green end-to-end (format:check, lint, typecheck,
   all tests, production build).
9. ✅ 155 tests passing — 48 web / 9 authorization / 49 database (real
   remote dev DB, zero mocks) / 49 domain; no test removed or weakened.
10. ✅ Production build: 23 routes + proxy middleware, zero errors.
11. ✅ ESLint zero warnings; Prettier clean.

Database invariants (real-DB isolation suite):

12. ✅ RLS enabled on all 16 new tables; cross-tenant reads return empty.
13. ✅ Published lesson/course/assessment versions immutable — UPDATE and
    DELETE raise `42501` via trigger even for definer code.
14. ✅ Prerequisite cycles rejected authoritatively (direct cycle via
    recursive-CTE trigger; self-cycle via CHECK).
15. ✅ Enrollments, progress, analytics events not directly writable by
    any client role (grants revoked; RPC-only).
16. ✅ `outbox_events` fully inaccessible to tenants — owner SELECT and
    INSERT both fail.
17. ✅ `app.emit_event` and `app.evaluate_course_completion` not
    executable by client roles.
18. ✅ Idempotent replay: repeated lesson completion is a no-op with
    exactly one `learning.lesson.completed` event.
19. ✅ Draft lessons/modules/blocks return zero rows for learners.
20. ✅ Progress spoofing blocked: wrong owner, suspended member, lesson
    outside the enrollment, lesson outside the pinned version.
21. ✅ Enrollment governance: assigning requires `enrollment.manage`;
    self-enrollment requires own membership + `enrollment.self` + the
    target's allow flag.
22. ✅ Manual override requires `progress.override` and a substantive
    reason; recorded with `overridden_by`.
23. ✅ `progress.override` present for owner/admin in both existing orgs
    (backfill) and future orgs (`app.create_system_roles` revision).

Browser QA (real dev DB, hidden-pane workarounds documented):

24. ✅ Owner sign-in → org selection → admin; all four new nav items
    (Learning, Courses, Enrollments, My learning) present.
25. ✅ `/admin/learning` renders systems, paths, ordered nodes, and the
    prerequisite label ("requires Foundations of Practice").
26. ✅ Course catalog lists drafts with published-version badges.
27. ✅ Course builder: modules/lessons in position order with per-lesson
    version badges and keyboard-accessible reorder controls.
28. ✅ Publish panel pins EXACT lesson versions (`→ pins v1`) and names
    the next immutable version number.
29. ✅ Publish gates: lesson-less course blocked ("Add at least one
    lesson"); unpublished lesson named ("Publish these lessons first: QA
    Lesson One").
30. ✅ Lesson editor: published badge with timestamp, dirty tracking, and
    a correct draft-vs-published diff (`0 changed, title changed` on the
    seeded refresh fixture — after fix #2).
31. ✅ Safe preview: `**bold**` renders as `<strong>`; the injected
    `<script>` probe appears as inert text (the only DOM match is Next's
    escaped flight payload; no alert fires).
32. ✅ End-to-end authoring: create course → module → lesson → block →
    publish lesson v1 → publish course v1, all through the UI.
33. ✅ Enrollment assignment UI: member + published-target pickers;
    resulting row shows "Pinned at enrollment"; Withdraw offered only on
    active enrollments (completed rows are evidence).
34. ✅ Author (no `content.publish`): no publish controls, "Publishing
    requires publish access" notice, drafting still available; admin nav
    trimmed to permitted surfaces.
35. ✅ Learner home lists both enrollments with terminology-aware
    progress counts.
36. ✅ Path map: locked node renders the domain reason ("Complete
    Foundations of Practice first.") and is not a link.
37. ✅ Learner course view shows the exact pinned "Version 1"; the newer
    draft title does NOT leak (published title rendered).
38. ✅ Sequence lock reason rendered verbatim (`Complete "Principles"
first.`); available/completed rows link, locked rows do not.
39. ✅ Lesson viewer renders frozen published blocks (rich text, callout,
    checklist) with the lesson version badge; Back navigation intact.
40. ✅ Completion flow: Mark complete → "Completed ✓" → course view shows
    "completed — well done" + the ADR-017 stays-valid message.
41. ✅ Server-side event chain for the QA flow verified in the database:
    8 events in causal order (lesson published → course published →
    enrolled → lesson started → course started → lesson completed →
    course completed → enrollment completed) with 8 matching outbox rows
    — exactly once each.
42. ✅ BFH tenant delivery: journey/program/phase terminology overlay live
    end-to-end on home, path map, and course view; canonical entities
    unchanged underneath.

Advisors:

43. ✅ Supabase security + performance advisors reviewed: no new
    findings beyond the known intentional set — deny-all RLS tables
    (`app.reserved_slugs`, `outbox_events` — by design), SECURITY DEFINER
    RPCs callable by `authenticated` (each authorizes internally; the
    documented pattern), leaked-password protection still OFF (§8), and
    INFO-level unindexed audit/composite FKs + not-yet-used indexes on
    the new tables (expected on a fresh schema; revisit with real load).

## 7. Deferred

- Outbox worker (contract written in
  [../architecture/transactional-outbox.md](../architecture/transactional-outbox.md));
  rows accumulate harmlessly until fan-out is needed.
- Enrollment version-migration operation (ADR-017 explicit future op).
- Client-emitted telemetry events (`learning.block.viewed` etc.) — batch
  endpoint arrives with its phase.
- Analytics partitioning (playbook + threshold documented).
- Assessment engine, grading, credentials: Phase 1D.
- Learner post-sign-in landing: members with no admin permissions land on
  the (correctly trimmed) admin overview; routing learners straight to
  `/learn` is a small future UX improvement (pre-existing behavior).
- Terminology copy-lint for hardcoded entity nouns (carried from 1B).

## 8. Manual / unverified items

- Leaked-password protection: **still OFF** (confirmed via security
  advisor this phase; dashboard-only toggle, owner action).
- SMTP: Supabase built-in (rate-limited) — unchanged, fine for dev.
- Storage CORS / image transformation config: defaults; nothing in 1C
  required them — **unverified**.
- Auth URL configuration: unchanged from Phase 1A; magic-link flow not
  exercised this phase.
- Docker: still not installed; remote-dev testing remains the documented
  deviation.
- **QA environment note:** the embedded QA pane does not composite frames
  (no screenshots, empty accessibility tree); QA was driven via scripted
  DOM interaction with React-compatible native events, and the
  React 19.2 Suspense reveal workaround (`$RV`) — an environment
  artifact, not an app defect (carried from 1B).
