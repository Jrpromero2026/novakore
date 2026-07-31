# Platform Experience Transformation — Report

**Date:** 2026-07-31 · **Scope:** organization-admin workspace (UI/UX only)

---

## 1. Executive result

The organization workspace was rebuilt from a uniform grid of bordered
cards into a composed operational surface. The Overview now opens with a
viewer-addressed header, leads with a dominant publishing-readiness module
carrying a real activity sparkline, and continues through varied,
purpose-shaped sections — attention queue, activity timeline, continue
working, creation surface — instead of eight identical boxes. Nine
priority interiors were moved onto one shared header/panel/row system, the
shell gained collapsed-rail tooltips and a real account menu, the command
palette gained recents and a useful zero-result state, and organization
settings moved off Overview to their own surface.

Every figure on the page is a live query. No trend percentages were
invented; no placeholder modules were added; no route in the navigation is
dead. The repository is green: format, lint, typecheck, **334 tests**, and
a successful production build. Nothing was committed and nothing was
deployed.

**This phase is not "complete" in the absolute sense** — the authenticated
browser matrix (§9/§10) could not be executed by the agent and remains an
owner step, and several deferrals are listed honestly in §15.

## 2. Baseline

| Item         | Value at start                                                               |
| ------------ | ---------------------------------------------------------------------------- |
| Branch       | `main`                                                                       |
| Commit       | `9addf40`                                                                    |
| Working tree | 47 changed paths (uncommitted Brand v1.0 + Phase 1 work)                     |
| Tests        | 325 (web 69 · authorization 9 · database 94 · design-system 16 · domain 137) |
| Lint         | clean                                                                        |
| Typecheck    | clean                                                                        |
| Build        | exit 0                                                                       |

Audited before changing code: shell/layout structure, `nav-config.ts`,
`OrgThemeStyle` token resolution, `getOrgBrandContext`, the primitives in
`components/ui/`, all 16 admin routes, `lib/data/{studio,ops,assessments}`,
`can()`/`requirePermission()` call sites, light/dark token blocks, the
`nk-*` motion utilities, the responsive breakpoints in the shell, the
existing workspace tests, `docs/brand/*`, and the Built For Her tenant
theme. Data inventory confirmed `analytics_events` as a real event log:
27 distinct namespaced types, real `occurred_at`/`actor_user_id`, and a
genuine multi-day distribution.

## 3. Product and UX decisions

1. **Varied composition over uniform cards.** Sections now differ in
   shape, weight, and border treatment. The spotlight is elevated; metric
   strips are borderless and divided; attention items are rails; creation
   uses one emphasized tile plus compact rows.
2. **No fabricated trends.** The event log spans only a few days of real
   activity, so a "+12% vs last period" would be a lie. Metrics carry
   **composition and status** instead ("3 published · 2 draft only",
   "of 41 started"), and the one time-series is an honest zero-filled
   daily count with an explicit window label.
3. **The viewer is greeted, never the organization.** `Greeting` uses the
   viewer's own handle derived from their account, with a neutral
   "Welcome back" fallback when no name exists.
4. **Attention is a queue, not a card.** Items appear only when a real
   condition exists (open reviews, drafts, open feedback, pending
   invitations); when nothing is waiting the section says so in one line
   rather than leaving a large blank panel.
5. **Settings left Overview.** A dedicated `admin/settings` surface holds
   the organization profile so the workspace home stays operational.

## 4. Before / after architecture

| Concern          | Before                                              | After                                                         |
| ---------------- | --------------------------------------------------- | ------------------------------------------------------------- |
| Overview         | 8 identical `Card`s in a 4-col grid + settings form | 6 purpose-shaped sections, settings removed                   |
| Metrics          | `MetricCard` boxes, all bordered                    | `Metric` signals in divided borderless strips, one emphasized |
| Activity         | none                                                | real timeline from `analytics_events` + sparkline             |
| Attention        | none                                                | prioritized queue from real conditions                        |
| Page headers     | ad-hoc `<header>` per page, 3 different type scales | shared `PageHeader` (eyebrow/title/description/actions)       |
| List surfaces    | `Card` + `divide-y` + bespoke row markup            | `Panel` + `DataRow`, consistent hover/truncation              |
| Session controls | two inline text buttons                             | `UserMenu` (menu-button pattern, Escape/outside-click)        |
| Collapsed nav    | `title` attribute                                   | styled tooltip, `pointer-events-none`                         |
| Palette          | navigate + create                                   | + **Recent** group (localStorage), richer empty state         |

## 5. Screens and routes transformed

Overview · Settings (**new**) · Courses · Assessments · Reviews ·
Academies · Members · Roles & permissions · Branding · Learning paths ·
Studio (layout). Shell (topbar + sidebar + drawer) applies to all 17
admin routes. Learner routes under `[orgSlug]/learn` were **not touched**.

## 6. Components created or updated

**Created:** `components/ui/layout.tsx` (`PageHeader`, `SectionHeader`,
`Panel` with plain/outlined/elevated tiers, `Toolbar`, `DataRow`,
`StatusDot`), `components/ui/user-menu.tsx`, `components/dashboard/viz.tsx`
(`ActivitySparkline`, `CompositionBar`), `lib/data/workspace.ts`,
`lib/format.ts`, `app/[orgSlug]/admin/settings/page.tsx`.

**Updated:** `components/dashboard/widgets.tsx` (`MetricCard` → `Metric`
with context slot; `QuickActions` → `CreateActions` with a lead tile;
`ViewAll` extracted), `components/ui/icons.tsx` (+`IconSettings`,
`IconClock`), `command-palette.tsx` (recents, empty state, mobile sizing),
`nav.tsx` (tooltips, flush active rail), `nav-config.ts` (+Settings),
`admin/layout.tsx` (user menu).

## 7. Real data sources used

| Surface                                                                | Source                                                 |
| ---------------------------------------------------------------------- | ------------------------------------------------------ |
| Knowledge assets, drafts, open reviews, recently edited                | `getStudioHome`                                        |
| Active learners, enrollments, lessons, journeys, credentials, feedback | `getOpsMetrics` (from `analytics_events` + `feedback`) |
| Activity timeline, daily volume                                        | `getWorkspacePulse` → `analytics_events`               |
| Publishing composition                                                 | `getContentComposition` → `courses.status`             |
| Academies, members                                                     | direct RLS-scoped queries (unchanged)                  |

Only 14 event types with unambiguous phrasing are surfaced; anything the
system cannot describe truthfully is skipped rather than guessed at.

## 8. Tenant branding behavior

Unchanged and governed. The workspace renders under `OrgThemeStyle`, which
emits only validated-hex tokens that differ from the platform base;
protected semantics (success/warning/danger/info/focus) never accept
tenant input. All new components consume semantic tokens
(`--accent`, `--surface`, `--border-subtle`) — **no Built For Her berry
value is hardcoded anywhere**. The NovaKore mark still does not appear on
any tenant-themed surface. Learner-facing branding is untouched.

One deliberate exception, consistent with the brand docs: the empty-state
glyph and viz marks use `var(--accent)`, so they personalize per tenant.

## 9. Responsive verification

Structural work: topbar compresses (workspace label hides < `lg`, search
trigger hides < `sm`), sidebar collapses to a 3.75 rem rail and is replaced
by a drawer < `md`, metric strips reflow 2→4 columns, create grid reflows
1→2→3, palette switches to an 8vh inset with side padding on mobile.

**Verified by the agent:** no horizontal overflow at 375 px on reachable
routes; drawer open/close and collapse persistence covered by jsdom tests.
**Not verified by the agent:** the authenticated matrix at 1440/1280/1024/
768/430/375 — see §15.

## 10. Accessibility verification

Preserved and extended: `nav` landmark labeled, `aria-current="page"` on
the active item, tooltips `aria-hidden` + `pointer-events-none` with the
real name in `sr-only`, `UserMenu` uses the menu-button pattern (Escape
restores focus to the trigger, outside pointerdown closes), palette keeps
combobox/listbox semantics with `aria-activedescendant`, both
visualizations expose `role="img"` with descriptive labels **and** the
sparkline ships an `sr-only` data table, status is never color-alone
(`StatusDot` and composition segments pair color with text), all motion
runs through tokens and collapses under `prefers-reduced-motion`.

**Not verified by the agent:** screen-reader pass and keyboard walk of
authenticated pages.

## 11. Performance impact

No new dependencies — visualizations are hand-written SVG/CSS. Client
components are limited to what needs interactivity: `nav`, `command-palette`,
`user-menu`, `greeting`, plus pre-existing ones. Everything else,
including all new layout primitives, dashboard widgets, and both viz
components, stays server-rendered. `getWorkspacePulse` adds one indexed
`analytics_events` query bounded to a 14-day window and 2000 rows, plus
`getContentComposition` (one status select); both run only for permission
holders and in parallel with existing queries. Build time was unchanged
(≈13 s).

## 12. Tests added or changed

+9 tests (325 → **334**), no assertion weakened, no fixture modified.

- `nav-config.test.ts` — added settings gating on `org.manage`, extended
  the full-permission integrity case.
- `dashboard/viz.test.tsx` (**new**, 5) — zero-data, empty-array, and
  populated states for both visualizations; asserts the accessible label
  carries real totals/peak and that segments are text-labeled.
- `dashboard/greeting.test.tsx` (**new**, 3) — viewer greeted by handle at
  a fixed clock, neutral fallback with no name, `handleFromEmail` nulls.

Retained from Phase 1: sidebar landmark/`aria-current`, collapse toggle,
palette open/filter/navigate/close.

## 13. Final command results

```
npm run format:check   All matched files use Prettier code style!
npm run lint           clean (all workspaces)
npm run typecheck      clean (all workspaces)
npm run test:run       334 passed — web 78 · authz 9 · database 94 ·
                       design-system 16 · domain 137
npm run build          ✓ Compiled successfully in 12.9s
npm run verify         exit 0
```

`/[orgSlug]/admin/settings` appears in the build route manifest.

## 14. Files changed

**New (11):** `components/ui/layout.tsx`, `components/ui/user-menu.tsx`,
`components/dashboard/viz.tsx`, `components/dashboard/viz.test.tsx`,
`components/dashboard/greeting.test.tsx`, `lib/data/workspace.ts`,
`lib/format.ts`, `admin/settings/page.tsx`, this report (+ 2 icons added
to the existing icon module).

**Moved (1):** `admin/org-name-form.tsx` → `admin/settings/org-name-form.tsx`.

**Modified (14):** `admin/layout.tsx`, `admin/page.tsx`, `admin/nav.tsx`,
`admin/nav-config.ts`, `admin/nav-config.test.ts`,
`components/command-palette.tsx`, `components/dashboard/widgets.tsx`,
`components/dashboard/greeting.tsx`, `components/ui/icons.tsx`, and the
page interiors for courses, assessments, reviews, academies, members,
roles, branding, learning, studio layout.

## 15. Honest deferrals

1. **Authenticated browser matrix not executed.** The agent cannot sign in
   (entering credentials is outside its permitted actions), so Alpha admin,
   BFH admin, coach, restricted, and learner roles across light/dark and
   six widths were **not** visually verified. Structural responsive/a11y
   work is in place and unit-tested; the visual pass is an owner step.
   Instructions in §18.
2. **Live content search in the palette** — still navigation + creation
   only. A safe implementation needs a debounced, permission-scoped search
   endpoint; deferred rather than bolted onto the client.
3. **Toast, Dialog, Breadcrumb, Tabs primitives** — not created, because
   no current surface consumes them. Adding unused components would be
   speculative.
4. **Deep interiors untouched** — lesson editor, path builder, assessment
   editor, brand studio internals, ops review. Their page _headers_ now
   match the system; their inner workflows retain prior density.
5. **Enrollments, Credentials, Terminology, AI Studio, Library interiors**
   — inherit the shell and header system but did not receive row-level
   treatment this pass.
6. **Optimistic UI** — not added anywhere; existing server-action flows
   were left exactly as they are.
7. **`AttentionItem` type in `workspace.ts`** is exported but the Overview
   currently composes attention inline; the type is there for the next
   surface that needs it.

## 16. Risks

- **Low — visual regressions on unverified pages.** Header/panel swaps
  were mechanical, typecheck and lint are clean, and no logic changed, but
  nine interiors were altered without a visual pass.
- **Low — activity phrasing.** Event verbs are hand-mapped; an unmapped
  type silently drops from the feed (deliberate) rather than rendering a
  raw identifier.
- **Low — actor emails.** Resolution is gated on `org.members.manage` in
  addition to `analytics.view`; an analytics-only viewer sees "A member".
  This is enforced at the call site in `admin/page.tsx`, not inside the
  data function — a future caller must pass the flag correctly.
- **None — permissions/tenancy.** No authorization code, RLS policy,
  schema, or data-layer contract was modified.

## 17. Recommended next phase

1. Owner-run visual QA of the matrix in §18, then fix whatever it surfaces.
2. Palette content search behind a proper search endpoint.
3. Deep-interior pass: lesson editor and path builder (highest daily use).
4. Raise light-mode status colors to AA (carried over from Brand v1.0 —
   still the top accessibility debt).
5. Toast/Dialog primitives once a real consumer exists.

## 18. Exact local review instructions

```bash
npm run dev
```

Sign in at <http://localhost:3000/sign-in> with the **Password** tab.
Seed password: `NovaKore-dev-password-1`.

| Account                       | What to check                                                                                                                                  |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `alpha.owner@novakore.test`   | Full workspace: `/alpha-learning/admin` — greeting, spotlight, sparkline, attention queue, activity, create surface, and the new Settings item |
| `bfh.owner@novakore.test`     | `/bfh-dev/admin` — same structure under the berry tenant theme; confirm no NovaKore mark appears                                               |
| `alpha.author@novakore.test`  | Reduced nav: no Members/Roles/Settings; no analytics metrics or activity feed                                                                  |
| `alpha.learner@novakore.test` | Learner surface only — confirm `/[org]/learn` is visually unchanged                                                                            |

While signed in: press **Cmd/Ctrl+K** (navigate once, reopen — the
destination should now appear under **Recent**); collapse the sidebar and
hover a rail icon for the tooltip; open the avatar menu and press Escape;
toggle light/dark; resize to 1440 / 1280 / 1024 / 768 / 430 / 375 and
confirm no horizontal scrollbar on Overview, Courses, and Members.
