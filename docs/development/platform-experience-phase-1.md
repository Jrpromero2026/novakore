# Platform Experience — Phase 1 Report (2026-07-30)

Platform shell, navigation, executive dashboard, command palette, and
interaction-quality redesign. UI/UX only: no architecture, schema, API,
permission, or theming-pipeline changes. Learner surfaces untouched.

## What shipped

**Platform shell** (`[orgSlug]/admin/layout.tsx`, `nav.tsx`,
`nav-config.ts`): full-width workspace layout — sticky glass topbar
(backdrop blur, org identity, command-palette trigger, theme toggle,
session controls), sectioned icon sidebar (Workspace / Knowledge /
Learning / Organization), elegant collapse to an icon rail (preference in
localStorage via `useSyncExternalStore`), slide-over drawer on mobile,
accent-rail active states with longest-prefix route matching. The nav
model is one config consumed by both sidebar and palette; sections are
additive so future modules (knowledge graph, automation, developers) slot
in without reshaping the shell.

**Executive dashboard** (`admin/page.tsx` + `components/dashboard/`):
time-of-day greeting (viewer's clock, hydration-safe), org context line,
metric cards, quick-action grid, and three activity panels (recently
edited, drafts, pending reviews). **Every figure is a live query** —
academies, knowledge assets (courses/paths/blocks/assessments via
`getStudioHome`), members, active learners/enrollments/lessons/credentials
(via `getOpsMetrics`), open reviews, open feedback. All widgets are
permission-gated affordances; nothing is fabricated. Organization-profile
form retained.

**Command palette** (`components/command-palette.tsx`): Cmd/Ctrl+K,
grouped Navigate/Create entries pre-filtered by permission server-side,
prefix-scored fuzzy filtering, full listbox keyboard semantics
(combobox/option ARIA, arrow keys, Enter, Escape), glass overlay within
motion tokens.

**Design-system polish**: icon set (`components/ui/icons.tsx`, 24-px grid
/ 1.75 stroke / currentColor per iconography.md); buttons now use
accent-hover/active tokens; inputs gained hover/transition affordances;
skeletons upgraded from pulse to shimmer (`nk-shimmer`); EmptyState
gained the brand-derived knowledge-core glyph + secondary-CTA slot
(consumers unchanged); motion utilities `nk-fade-up`/`nk-slide-in` in
globals.css — all collapse under `prefers-reduced-motion`.

**Widgets** (`components/dashboard/widgets.tsx`): MetricCard, Panel,
ListRows, QuickActions — reusable, server-safe, token-driven.

## Boundaries honored

- Admin shell renders under `OrgThemeStyle` exactly as before: tenant
  accent/fonts/radii keep resolving; **no NovaKore mark was added to any
  tenant-themed surface** (framework §10). Built For Her admin still reads
  Built For Her.
- Navigation maps only to existing routes — no stub modules, no mock
  content. AI Studio/Analytics point at the real `studio/ai` and `ops`
  surfaces.
- `react-hooks/set-state-in-effect` clean: drawer close-on-navigate and
  collapse preference are derived state / external-store reads, not
  effect-driven setState.

## Verification

- `npm run verify` exit 0: format ✓, lint ✓ (all workspaces), typecheck ✓,
  **325 tests passed** (web 69 · authorization 9 · database 94 ·
  design-system 16 · domain 137), production build ✓.
- New tests: `nav-config.test.ts` (permission filtering, section pruning,
  href/icon integrity) and `shell.test.tsx` (sidebar landmarks +
  aria-current, collapse toggle, palette open/filter/navigate/close) —
  +7 over the Brand v1.0 baseline.
- Live admin click-through requires a signed-in browser session and
  remains an owner step (same constraint as prior phases; no screenshots
  fabricated).

## Deferred (honest gaps for Phase 2 of this track)

- Per-page interior redesigns (courses/assessments/members tables) — the
  shell, primitives, and widgets carry the quality; interiors still use
  the previous density.
- Palette search over live content (lessons/members by name) — entries are
  navigation + creation today; a search endpoint would make it universal.
- Dedicated Dialog/Tooltip/ContextMenu/Breadcrumb primitives — not yet
  needed by any surface; add when a consumer exists.
- Success micro-animations beyond the existing lesson-completion moment.
