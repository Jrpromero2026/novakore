# NovaKore Experience Design System

The design language every NovaKore module and tenant inherits — BFH Academy,
G3 Performance, Performance Operations, and any future tenant. It defines _how
the product feels_, on top of the Brand v1.0 token layer
(`@novakore/design-system` → `globals.css`) and the workspace primitives
(`components/ui/layout.tsx`). The goal is an interface that feels like an
**operating system for organizational knowledge** — intelligent, precise,
crafted — not an admin panel.

This document governs experience decisions where it differs from the Phase 1B
framework. It is descriptive of a real, enforced system: every rule here is
backed by a token, a utility class, or a primitive that already exists in the
codebase. Nothing here licenses decoration for its own sake.

## First principles

1. **Every screen answers three questions instantly** — _What matters now? What
   do I do next? What is happening across my organization?_ Layout hierarchy,
   not chrome, answers them.
2. **Honesty is a design constraint.** We never render a metric, trend, or
   insight we cannot derive from real data. Where history is too thin for an
   honest comparison we show _composition or status_, never an invented delta.
   A command center that shows fake numbers stops feeling like one. This is why
   the product feels trustworthy, which is itself premium.
3. **Restraint is the aesthetic.** Confidence is communicated through layout,
   typography, spacing, depth, and motion — not accent color, gradients, or
   glass. Color is reserved for emphasis. On tenant surfaces the _tenant_ accent
   carries emphasis; the NovaKore brand gradient never appears on org surfaces.
4. **Motion communicates state or continuity — never decoration.** Every
   animation has a job: reveal, draw, lift, orient. All of it collapses under
   `prefers-reduced-motion`.
5. **One product.** A card, a button, an empty state must look and behave the
   same in Studio, Analytics, and the dashboard. Variants are deliberate and
   few.

## Surface hierarchy (depth without noise)

Depth is expressed with **four surface tiers** and one elevation step, not with
outlines on everything. The workspace should not draw a box around every object
(`ui-principles.md`).

| Tier        | Token                   | Use                                                           |
| ----------- | ----------------------- | ------------------------------------------------------------- |
| Canvas      | `--background`          | The page. Recedes.                                            |
| Surface     | `--surface`             | Default panel body.                                           |
| Elevated    | `--surface-elevated`    | Raised panels, hero, popovers — pairs with `--shadow-raised`. |
| Interactive | `--surface-interactive` | Hover/active fills, sunken wells.                             |

Elevation tokens: `--shadow-raised` (resting raised surfaces), `--shadow-lifted`
(hover/focus lift — new), `--shadow-overlay` (popovers, dialogs, command
palette). **Dark mode separates surfaces with border + tone, not glow** — dark
shadows exist for overlays and deliberate lift only. A premium surface may carry
a 1px top "lighting" hairline (`.nk-hairline`) that catches light from above;
use it on hero and elevated hero cards only.

**Panel tiers** (`components/ui/layout.tsx` → `<Panel tone>`): `plain` (tone +
spacing, no border), `outlined` (hairline border), `elevated` (border + shadow),
`hero` (elevated + top hairline + restrained accent wash). Add `interactive` to
any panel to opt into the hover-lift behavior below.

## Elevation & lighting

- Resting depth is quiet: at most `--shadow-raised` on truly raised objects.
- **Lift on intent**: interactive cards rise on hover to `--shadow-lifted` with
  a ≤2px `translateY(-2px)`, over `--motion-fast`, `--ease-out`. This is the
  primary "this is alive / this responds" cue.
- Lighting is a whisper: the `.nk-hairline` top edge and the hero accent wash
  (`color-mix` of the tenant accent at 6–8% into the surface) are the only
  ambient light. No glows, no neon, no colored shadows.

## Motion principles & timing

Durations and easings come from tokens — never hardcode.

| Token               | Value                       | For                                     |
| ------------------- | --------------------------- | --------------------------------------- |
| `--motion-fast`     | 140ms                       | Hover, press, color/lift state changes. |
| `--motion-standard` | 200ms                       | Entrances, reveals, expands.            |
| `--motion-slow`     | 300ms                       | Larger spatial moves, chart draws.      |
| `--ease-out`        | cubic-bezier(0.16,1,0.3,1)  | Entrances (decelerate in).              |
| `--ease-in-out`     | cubic-bezier(0.65,0,0.35,1) | State changes both ways.                |

Utility classes (all collapsed by the global reduced-motion rule):

- `.nk-fade-up` — content reveal (opacity + 4px rise).
- `.nk-rise` — same, with `--nk-stagger` index for staggered lists/grids.
- `.nk-scale-in` — a completion/confirmation moment (subtle scale from 0.98).
- `.nk-pop` — popover/menu/dialog presentation: `nk-scale-in` from its origin
  edge (`transform-origin: top`; override with an `origin-*` utility).
- `.nk-backdrop` — overlay scrim fade (dialogs, drawers, command palette).
  Scrims never snap in.
- `.nk-press` — tactile press: owns the element's full transition set (color +
  transform on one timeline) and scales to 0.985 on `:active`. Every button
  and button-like control carries it.
- `.nk-draw` — a line chart drawing itself (animated `stroke-dashoffset`).
- `.nk-shimmer` — skeleton loading only.

Field focus grammar: inputs/textareas/selects share one focus behavior — the
border takes the accent and a soft 3px `--accent-soft` ring blooms in over
`--motion-fast` (see `fieldFocus` in `components/ui/primitives.tsx`).
Validation errors enter with `.nk-fade-up`; action outcomes settle in with
`.nk-scale-in` (`ActionBanner`).

Rules: nothing loops except skeletons. Nothing animates on scroll ambiently.
Staggers cap at ~6 items and ~40ms apart. Target 60fps: animate only
`opacity`, `transform`, and `stroke-dashoffset` — never layout properties.

## Hover & interaction behaviors

- **Affordance is visible before click.** Interactive surfaces lift or fill on
  hover; icons shift from `--text-muted` toward `--accent`; "view all" arrows
  brighten. Non-interactive surfaces never move.
- **Every click has feedback** within `--motion-fast`: fill, lift, or press.
- **Focus is never lost.** `:focus-visible` renders a 2px `--focus-ring` ring
  at 2px offset on every interactive element. Hover and focus are visually
  distinct.
- Number counters animate _once_ into place on first paint (see AI/metrics),
  never on every re-render.

## Animated counters & counters honesty

`AnimatedNumber` (`components/ui/motion.tsx`) renders the **real value in
server HTML** and, after hydration, counts up to it via `requestAnimationFrame`
writing to a ref — no React state, no re-renders, 60fps. With reduced motion or
no JS it simply shows the final number. Counters are visual polish over a value
that is already correct and accessible; they never imply data we lack.

## Visualization standards

Pure SVG/CSS on theme tokens — **no chart dependency, ever**. Every chart:

- carries a text equivalent (`sr-only` table) and an `aria-label` summary;
- encodes identity by direct label, never by color alone;
- handles the zero-data case explicitly with a truthful empty state;
- is single-measure unless a legend is present;
- draws itself with `.nk-draw` (line) or fades/reveals (bars), once.

Sparklines are baseline-anchored, 2px non-scaling stroke, recessive fill at
~12% accent. We only render a series we actually have (e.g. real daily event
volume); we never synthesize a per-metric trendline to decorate a number.

## Executive dashboard standards

The Overview is an **Executive Command Center**, composed top-to-bottom as:

1. **Hero** — greeting + organization + live status, a **Knowledge Health**
   read derived from real signals (publishing readiness, open attention), and a
   primary + secondary CTA. Elevated `hero` surface, tenant-accent wash, top
   hairline. This is the "what matters now."
2. **Executive metrics** — a rhythm of metric cards (not identical rectangles):
   real values with animated counters and honest context (composition/status),
   the lead metric emphasized. Sparkline only where a real series exists.
3. **Nova Intelligence** — a persistent panel of **real derived insights**
   (drop-off from `ops.dropOff`, draft backlog, open reviews, open feedback,
   credential/completion reads). Each insight appears only when its real
   condition holds, carries a plain-language sentence and a recommended action
   (Review / Publish / Improve / Open). Empty state = "All clear." This is a
   defining surface — and it is defining _because_ it never lies.
4. **Priority Center** — the attention queue, grouped by priority band
   (Critical · Needs Review · Awaiting Approval · Publishing · Feedback ·
   System) with visual weight per band. Real, actionable conditions only.
5. **Continue working** — rich workspace cards for recently edited content
   (title, status, context, edited-time, continue affordance). We show only
   what we have; we do not fabricate collaborators/comment counts.
6. **Activity timeline** — a real, iconified, time-grouped event stream from
   `analytics_events`, described in human language.
7. **Create** — permission-scoped starting points; lead action emphasized.

## AI interaction patterns (Nova, everywhere)

AI is **present, not intrusive**. Nova surfaces as: (a) the dashboard
Intelligence panel; (b) inline, contextual suggestion chips on module surfaces
(e.g. "High drop-off on this lesson", "Missing metadata") that appear only from
a real signal; (c) governed authoring in AI Studio. Every Nova suggestion:

- states an observation in one plain sentence, grounded in real data;
- offers 1–3 concrete actions and a Dismiss;
- is visually distinct (a soft accent-washed container, a Nova glyph) but
  quiet — never a modal interruption, never a flashing badge;
- is honest about provenance: derived signals are labeled as observations, not
  predictions, and demo/sample content (if ever shown) is explicitly labeled.

## Command palette behavior

`⌘/Ctrl+K` opens the palette (`components/command-palette.tsx`), sourced from the
same `nav-config.ts` model as the sidebar. It overlays with `--shadow-overlay`
at `--z-overlay`, reveals with `.nk-scale-in`, is fully keyboard-driven
(arrows, enter, escape), and mirrors permission scoping — it never lists a
destination the viewer cannot reach.

## Page transition standards

Navigation orients rather than dazzles: interiors open with a single
`.nk-fade-up` on the primary content region; section blocks may `.nk-rise` with
a capped stagger. No full-page wipes, no cross-fades that hide content, no
layout shift. Skeletons (`.nk-shimmer`) match the final layout's shape so the
page doesn't jump when data arrives.

## Empty state philosophy

An empty state is an **invitation, not an apology**. It says what will appear
here, why it's worth the first action, and offers that action. It uses a quiet
glyph and one line of copy — never a large illustration, never a dead-end. A
truthful empty state ("No events in the last 14 days") always beats a fabricated
placeholder number.

## Card variants (the deliberate set)

| Variant   | Weight   | Where                                          |
| --------- | -------- | ---------------------------------------------- |
| Metric    | medium   | Executive metrics; value + label + context.    |
| Insight   | medium   | Nova Intelligence; observation + actions.      |
| Workspace | rich     | Continue working; title + status + context.    |
| Priority  | variable | Priority Center; weight tracks band severity.  |
| Action    | light    | Create surface; icon + label + description.    |
| Hero      | dominant | The one hero per page; wash + hairline + CTAs. |

Cards are not all the same weight. The hero dominates; important cards breathe;
secondary information recedes. Avoid endless identical rectangles — rhythm is
created by mixing weights within a page.

## Accessibility & performance (non-negotiable)

- WCAG AA contrast is enforced by `tokens.test.ts`; the one documented pre-v1.0
  status-color gap must never regress.
- All motion honors `prefers-reduced-motion`.
- Full keyboard operation and visible focus everywhere.
- Charts and animated numbers degrade to correct, readable values with no JS.
- Animate only compositor-friendly properties; no new runtime dependencies.

## Knowledge IDE (Studio)

Studio is a **Knowledge IDE**, not a course builder: knowledge creation gets
the tooling software gets. Three panels — the **knowledge tree** (the org's
real structure: journeys, courses, the open course's modules and lessons),
the **canvas** (content is the interface: inside `.nk-canvas`, fields are
borderless and transparent at rest, surfaced on hover, ringed on focus; block
controls appear on intent only), and the **inspector** (Knowledge Health,
real version history, real review activity, Nova's doorway) which collapses
naturally via native `<details>`.

- **Slash commands**: `/` (or the add affordance) opens keyboard-first block
  insertion — search, arrows, Enter. Same grammar as the command palette.
- **Knowledge Health** is coaching, not errors: an honest "n of m signals
  present" derived entirely from the draft in front of the author
  (`lib/lesson-health.ts`) — never a synthetic quality percentage.
- **Publishing is a ceremony**: a confirm dialog states the immutable-version
  contract, lists real checks (validity, health, drift vs the live version),
  names the version being created, and celebrates success (`.nk-scale-in`).
- **The curriculum map** (successor to the knowledge graph, which stopped
  being readable past a handful of nodes) shows only real relationships:
  journeys list their courses in path_nodes order, prerequisite rows render
  as "unlocks after …", and every count is a count of real rows. Content no
  enrollment can reach — courses on no journey, evaluations attached to no
  lesson — is called out explicitly. Nothing inferred, nothing decorative.
- **Focus mode** hides both rails for distraction-free writing. `⌘/Ctrl+S`
  saves; every version ever published stays visible in the inspector.

## Nova Intelligence Layer

Nova is an **operating layer, not a chatbot**: no chat window, no popups, no
interruptions. Intelligence appears as cards, insights, scores, coaching, and
actions woven into existing surfaces. Its one law extends the honesty
principle: **Nova only ever says what the database can prove.**

- **The engine is pure and tested** (`lib/nova-insights.ts`): rows in,
  grounded observations out. The data layer (`lib/data/nova.ts`) feeds it
  real records under the caller's RLS session; learner signals are fetched
  only under `analytics.view`.
- **Insights are observations with actions** — circular prerequisites,
  broken pathways, unvalidated journeys, isolated knowledge, repeated
  titles, wild length swings, unused library blocks, drop-off points,
  hard evaluations, quiet enrollments, publishing slowdowns. Each names its
  evidence ("2 of 6 starts finished") and offers one action. Signals that
  cannot be derived simply do not appear.
- **The scorecard is explained ratios, never invented scores**: each
  dimension shows n of m, its percentage, and a plain-language explanation
  of exactly what was counted. No basis → an em dash, not a fake number.
- **The digest compares two real windows** (this week vs last week, counts
  from the event log) — never a projected trend.
- **Organizational memory** is the evolution curve: cumulative published
  versions by week, every point a real immutable version.
- **Author coaching lives in Knowledge Health** (density, accessibility of
  media, structure…) — coaching lines, never criticism.
- **Deliberately not built**: semantic/embedding search and free-form chat.
  Both require a live AI provider and new infrastructure; until then,
  keyword search over real titles is what exists, labeled as such.

## Organizational Operating System

Organizations are owners, not tenants: NovaKore supplies the operating
system, organizations supply the culture — and the platform reflects it
without losing its own coherence (tenant accent + terminology personalize
every surface; the NovaKore brand never floods org spaces).

- **Identity layer**: mission, vision, values, operating principles, and
  voice live in `organization_settings.settings.identity` (jsonb — additive,
  RLS: members read, `org.manage` writes; `lib/org-identity.ts`). Identity is
  displayed, never invented: an org without a recorded mission sees an
  invitation, not filler copy.
- **Organization Hub** (`/admin/organization`): identity hero, knowledge
  health (the Intelligence scorecard), real membership growth, recent
  publishing, and the **living timeline** — every entry a real dated record
  (founding, academies launched, brand published, journeys created, first
  publish, depth milestones). History, not activity logs.
- **Terminology is a first-class capability** (existing engine) and Nova now
  watches for drift: draft prose using canonical words the organization has
  renamed becomes a grounded observation with a one-click path to fix.
- **Organizational awareness in Nova**: contributor rhythm (busiest weekday,
  only with ≥30 events and a real concentration), aging reviews, terminology
  drift — evidence named in every sentence.
- **Personalization primitive — pins**: any admin page can be starred into
  the member's own sidebar (local, per-org, capped at 8 — the same storage
  pattern as the nav-collapse preference). Layouts stay consistent;
  belonging comes from _your_ pins, _your_ terminology, _your_ accent.
- **Global search**: the command palette now indexes real knowledge titles
  (lessons, courses, journeys, evaluations) for draft-visibility holders —
  grounded rows, keyboard-first, permission-scoped.

**Expansion paths (architected, deliberately not built):** configurable
governance workflows (needs a workflow-definition schema; today's
draft→review→publish flow is enforced and non-configurable), presence and
real-time collaboration (needs realtime infra; ownership signals surface
from existing columns), announcements/pinned initiatives (jsonb-ready),
multiple saved dashboard layouts, cross-org sharing / templates /
marketplace / white-label (multi-academy schema and the permission catalog
are the foundation; nothing in this phase forecloses them).

## Governance

Extend the system, don't fork it: new surfaces consume these tokens, utilities,
and primitives. If a screen needs something new, add it here and to the token/
primitive layer first, then use it — so BFH, G3, and every future tenant inherit
one coherent experience instead of drifting into inconsistent screens.
