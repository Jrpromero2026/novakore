# Guided Onboarding & Platform Walkthrough System

Status: implemented (Phase 6 — "Academy Launch")
Owner surface: organization-admin workspace (`/[orgSlug]/admin`)

## 1. Pre-implementation audit findings

### Shell & navigation

- The admin shell is a server layout ([layout.tsx](../../apps/web/src/app/%5BorgSlug%5D/admin/layout.tsx))
  with a client `ShellProvider` + `AdminSidebar` ([nav.tsx](../../apps/web/src/app/%5BorgSlug%5D/admin/nav.tsx)).
  Navigation is config-driven from `buildNavSections()` in
  [nav-config.ts](../../apps/web/src/app/%5BorgSlug%5D/admin/nav-config.ts) —
  the single source for sidebar + command palette. Permission filtering is an
  affordance only; the server authorizes every route (ADR-006).
- Sidebar supports collapse (localStorage `nk-nav-collapsed`) and a mobile
  drawer (ShellContext). The onboarding engine integrates with both.

### Domain model mapping (prompt terms → live architecture)

| Prompt term | Live entity   | Table            | Notes                                 |
| ----------- | ------------- | ---------------- | ------------------------------------- |
| Journey     | Learning path | `learning_paths` | belongs to a `learning_system`        |
| Program     | Course        | `courses`        | attached to journeys via `path_nodes` |
| Phase       | Module        | `modules`        | ordered inside a course               |
| Lesson      | Lesson        | `lessons`        | content lives in `content_blocks`     |

Tenant display language is already handled by the terminology system
(ADR-003, `organization_terminology`, `resolveTerm`). Built For Her Academy
can rename Course→Program, Module→Phase without any code change; all
onboarding copy resolves through `term()`.

### Existing infrastructure reused

- **Events**: `analytics_events` exists but INSERT is revoked from
  `authenticated` (writes go through SECURITY DEFINER RPCs). Onboarding adds
  its own small org-scoped `onboarding_events` table instead of widening
  that surface.
- **Permissions**: `@novakore/domain` `PERMISSIONS`; server checks via
  `can(ctx, …)`; RLS helpers `app.is_org_member` / `app.has_org_permission`.
- **Design system**: tokens in `globals.css` (`--motion-*`, `--z-*`,
  `nk-fade-up`, `nk-scale-in`, `nk-press`, reduced-motion global rule),
  primitives (`Button`, `Card`, `Badge`, `EmptyState`), layout
  (`Panel`, `PageHeader`, `SectionHeader`, `StatusDot`).
- **Server actions pattern**: zod-parse → `requireOrgContext` → `can()` →
  RLS-scoped write → `ActionState` (see `lib/actions/feedback.ts`).
- **Tests**: vitest + Testing Library (jsdom) in `apps/web`; live-RLS suites
  in `packages/database/src/__tests__` (skip when env not configured).
- **No pre-existing onboarding/tour/help infrastructure** — grep found none.

### Key surfaces audited for instrumentation

- Dashboard `admin/page.tsx` (command center; hero + metrics + priority).
- Learning paths `admin/learning` (`CreateSystemPanel`, `CreatePathPanel` —
  a journey requires a learning system first).
- Courses `admin/courses` (`CreateCoursePanel`), course builder
  (module/lesson creation, `PublishCoursePanel`).
- Members `admin/members` (`InvitePanel`; invitations are
  `organization_memberships` rows with `status='invited'`).
- Branding `admin/branding` (draft/published theme in
  `organization_branding.theme_draft/theme_published`).
- Organization hub `admin/organization` (identity stored under
  `organization_settings.settings.identity`, additive JSON — no schema change).
- Enrollments `admin/enrollments`, analytics `admin/ops` (progress review).
- Learner surface `/[orgSlug]/learn` (learner preview via "My learning").

## 2. Architecture

### Components

| Piece                | Location                                              | Kind   |
| -------------------- | ----------------------------------------------------- | ------ |
| Durable target ids   | `apps/web/src/lib/onboarding/targets.ts`              | shared |
| Walkthrough registry | `apps/web/src/lib/onboarding/registry.ts`             | shared |
| Checklist definition | `apps/web/src/lib/onboarding/steps.ts`                | shared |
| Completion resolvers | `apps/web/src/lib/data/onboarding.ts`                 | server |
| Actions              | `apps/web/src/lib/actions/onboarding.ts`              | server |
| Walkthrough engine   | `apps/web/src/components/onboarding/walkthrough.tsx`  | client |
| Checklist UI         | `apps/web/src/components/onboarding/checklist.tsx`    | client |
| Help & Learn menu    | `apps/web/src/components/onboarding/help-menu.tsx`    | client |
| Contextual help      | `apps/web/src/components/onboarding/context-help.tsx` | client |
| Page event markers   | `apps/web/src/components/onboarding/page-marker.tsx`  | client |
| Migration            | `supabase/migrations/*_onboarding_foundation.sql`     | db     |

### Durable target identifier convention

Every tour-addressable element carries `data-tour-id`, applied via
`tourTarget(TOUR_TARGETS.x)` from `lib/onboarding/targets.ts`. Identifiers
are typed constants (compile-time safety), kebab-case, stable across
refactors, and never derived from DOM position, text, or Tailwind classes.
Sidebar items get `data-tour-id` automatically from their `tourId` in
`nav-config.ts`.

### Walkthrough registry format

`registry.ts` exports `WALKTHROUGHS: WalkthroughDefinition[]`. Each
definition: `id`, `version`, `title`, `description`, `checklistStep?`
(links a checklist step), `requiredPermissions` (any-of), and `steps[]`.
Each step: `id`, `route(base)` , `target` (TourTargetId),
`fallbackTarget?`, `mobileTarget?`, `placement`, `title`, `body`,
`action?` ("navigate" | "await-condition" | "none"), `completeWhen?`
(client predicate polled against live DOM/route — advances the step when
the real action happened), `openMobileNav?`. The engine renders purely from
this data; adding a walkthrough is a registry entry + (if new) target ids.

### Checklist completion rules

| Step        | Rule (all org-scoped, RLS-read)                                            | Kind    |
| ----------- | -------------------------------------------------------------------------- | ------- |
| org-details | `organization_settings.settings.identity` has any content                  | derived |
| branding    | `organization_branding` has a draft/published theme or display name        | derived |
| journey     | ≥1 non-archived `learning_paths` row                                       | derived |
| program     | ≥1 non-archived `courses` row                                              | derived |
| phase       | ≥1 non-archived `modules` row                                              | derived |
| lesson      | ≥1 non-archived `lessons` row AND ≥1 `content_blocks` row                  | derived |
| publish     | ≥1 course with a published version OR ≥1 published lesson                  | derived |
| preview     | ≥1 `onboarding.preview.opened` event (recorded only for draft-viewers)     | event   |
| invite      | ≥1 other membership with status invited/active                             | derived |
| progress    | ≥1 `onboarding.progress.reviewed` event (enrollments or analytics visited) | event   |

Steps are permission-filtered (`needsAny`, any-of); progress percentages are
computed over the member's visible subset. Source of truth:
`lib/onboarding/steps.ts` (rules) + `lib/data/onboarding.ts` (signals).

### State model — derived vs explicit, org-scoped

- **Derived completion** (source of truth = real org data, computed
  server-side per request, never stored): org details, branding, journey,
  program/course, phase/module, lesson, published content, learner invited.
- **Explicit event completion** (only where data cannot prove the action):
  learner preview opened, progress review opened — recorded as
  `onboarding_events` rows (`event_type`, `step_id`, own-membership RLS).
- **Lifecycle state** `organization_onboarding` (one row per org):
  `dismissed_at`, `completed_celebrated_at` — additive, reversible; deleting
  the row loses only presentation state, never completion (completion is
  derived). Walkthrough progress (active tour, step index) is per-member,
  localStorage-scoped by org id — it never leaks across tenants because it
  is keyed by org and only ever rendered inside that org's authorized shell.

### Authorization

- New tables have RLS: reads require active org membership; writes are
  membership-anchored (`membership_id` must belong to `auth.uid()`), and
  the lifecycle row (dismiss/restore) requires `org.manage`.
- Walkthroughs are filtered by held permissions before rendering; a member
  never sees a walkthrough (or a checklist "Show me") for an action they
  cannot perform; nav targets hidden by authorization are never highlighted.
- Checklist completion queries are RLS-scoped to the caller's org;
  cross-tenant influence is impossible and covered by database tests.

### Events

Onboarding observability events (all in `onboarding_events`, no lesson
content, no PII beyond membership linkage):
`onboarding.checklist.viewed`, `onboarding.checklist.expanded`,
`onboarding.checklist.dismissed`, `onboarding.checklist.restored`,
`onboarding.checklist.completed`, `onboarding.step.started`,
`onboarding.step.completed`, `onboarding.step.skipped`,
`onboarding.walkthrough.started`, `onboarding.walkthrough.exited`,
`onboarding.walkthrough.resumed`, `onboarding.walkthrough.completed`,
`onboarding.walkthrough.target_missing`,
`onboarding.walkthrough.recovered`, `onboarding.preview.opened`,
`onboarding.progress.reviewed`.

### Accessibility

- Coachmark is `role="dialog"` with `aria-modal="false"` (page stays in the
  a11y tree), labelled title, step position announced via `aria-live`.
- Escape exits; focus moves into the coachmark on open and returns to the
  triggering element (or `document.body` fallback) on exit.
- Overlay dim uses four inert rects (pointer-events pass-through over the
  target); the highlighted element remains fully interactive.
- Progress is text ("Step 2 of 4") not color-only; buttons are labelled.
- `prefers-reduced-motion` collapses all transitions (global CSS rule +
  engine checks before smooth-scrolling).

### Mobile & collapsed navigation

The engine detects viewport (`matchMedia("(max-width: 767px)")`). When a
step targets a sidebar item on mobile it dispatches `nk-tour-open-nav`
(handled by `ShellProvider`) to open the drawer first; when the sidebar is
collapsed on desktop the target rail icons still carry `data-tour-id`, so
highlighting works unchanged. Async targets are awaited with a
MutationObserver + timeout; a missing target after timeout triggers the
recovery path (event + skip-forward UI), never a trapped state.

### How to add a walkthrough

1. Add any new target ids to `TOUR_TARGETS` and stamp the elements with
   `tourTarget(...)`.
2. Append a `WalkthroughDefinition` to `WALKTHROUGHS` (bump `version` when
   editing an existing one — versioning resets per-member local progress
   for that walkthrough only, never org data).
3. If it should appear on the launch checklist, link it via
   `checklistStep`.
4. Registry validation tests (`registry.test.ts`) enforce id uniqueness,
   target existence, and permission validity at CI time.

### How to version or retire a walkthrough

- **Version**: bump `version`; stored local progress keyed
  `nk-tour:{orgId}:{walkthroughId}:{version}` becomes inert and the tour
  restarts cleanly. No server state to migrate.
- **Retire**: remove the registry entry. Checklist steps fall back to
  "Take me there" navigation (no tour) if their walkthrough id is absent.

### Rollback / reversibility (database)

The migration is additive only. Reversal: `drop table
public.onboarding_events; drop table public.organization_onboarding;` —
no existing table is altered; no data outside these tables is touched.
Derived completion continues to work without them (lifecycle + event steps
degrade gracefully).
