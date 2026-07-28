# UI and Experience Architecture

Design architecture only — no full UI is implemented in this phase. This
document defines surfaces, the design direction, and reusable component
categories so later phases build one coherent system instead of accreted
screens.

## 1. Surfaces

### Administrator / author surfaces

| Surface                | Purpose                                                          | Phase                                          |
| ---------------------- | ---------------------------------------------------------------- | ---------------------------------------------- |
| Organization dashboard | Org health: members, academies, activity                         | 1A (minimal)                                   |
| Organization settings  | Profile, terminology, roles/permissions, integrations            | 1A (terminology, roles) / 1D (integrations)    |
| Branding studio        | Theme tokens, logo, accent, preview both modes                   | 1A (minimal) → 2 (full)                        |
| Academy dashboard      | Academy-scoped overview                                          | 1A (minimal)                                   |
| **Learning Studio**    | The authoring home: courses, lessons, assessments, library       | 1B (functional) → 2 (full experience)          |
| Course builder         | Structure editing: modules, lessons, ordering, publish           | 1B                                             |
| Lesson editor          | Continuous document canvas of blocks                             | 1B (core blocks) → 2 (full canvas)             |
| Assessment builder     | Items, settings, versions                                        | 1D                                             |
| Learning-path canvas   | Spatial graph: nodes, prerequisite edges, unlock logic           | 1C (list + simple canvas) → 2 (visual builder) |
| Rules builder          | Condition-tree composer with dry-run/explain                     | 3                                              |
| AI creation workspace  | Copilot panel inside Studio: generate → review → accept as draft | 2                                              |
| Learner analytics      | Funnels, drop-off, item difficulty, version comparison           | 1C (basic) → 3 (full)                          |
| Competency map         | Graph authoring + attainment overview                            | 3                                              |

### Learner surfaces

| Surface                   | Purpose                                                         | Phase |
| ------------------------- | --------------------------------------------------------------- | ----- |
| Home                      | Assigned + in-progress learning, next best action               | 1C    |
| Learning paths            | Path map with unlock states and "why locked" explanations       | 1C    |
| Course experience         | Course overview, module/lesson navigation                       | 1C    |
| Interactive lesson player | Renders lesson_versions; progress tracking; blocks incl. checks | 1B–1C |
| Assessments               | Attempt experience: timing, review, results per feedback policy | 1D    |
| Progress                  | Own progress, completions, evidence                             | 1C    |
| Credentials               | Issued certificates, verification links                         | 1D    |
| AI tutor                  | Context-aware panel within lesson player + standalone           | 3     |
| Competencies              | Own competency attainment and expiry                            | 3     |
| Saved resources           | Bookmarks/annotations                                           | 3+    |
| Notifications             | In-app notification center (email later)                        | 2     |

## 2. Design direction

- **Premium editorial, not dashboard-grade.** Strong typographic hierarchy
  (a display serif or high-quality humanist sans for headings — final
  typeface selection is a Phase 2 design decision; the token system, not the
  font, is the architecture), generous measure, real vertical rhythm.
- **Dark and light modes** are first-class from Phase 1A: every token has
  both values; no mode is a filter over the other.
- **Tenant-defined accents** ride the token system: tenants set accent
  palette + logo + typography choice from a curated set; the platform
  guarantees contrast (accent colors are validated against WCAG at input).
- **Layered surfaces**: depth expressed through surface elevation tokens
  (background → surface → raised → overlay), subtle borders and shadow
  ramps — not gratuitous glassmorphism or neon. Futuristic capability,
  restrained presentation.
- **Spatial learning maps**: the path canvas (author) and path map (learner)
  are the signature surfaces — positioned nodes, drawn edges, unlock states.
  Layout data lives on `path_nodes` from Phase 1C so the canvas upgrade in
  Phase 2 needs no migration.
- **Contextual panels over modals**: inspectors, settings, and AI copilot
  open as side panels preserving canvas context. Modals are reserved for
  true interruptions (destructive confirm, publish gate). **No modal-chain
  workflows.**
- **Command-palette readiness**: every navigation target and command is
  registered in a client-side command registry from Phase 1B; the palette UI
  itself ships Phase 2 for authors.
- **Continuous document editing**: the lesson editor is one scrollable
  canvas; block insertion via inline `/` affordance; block settings in the
  contextual panel.
- **Restrained motion**: 120–200 ms eased transitions, meaningful only
  (state change, spatial continuity); everything honors
  `prefers-reduced-motion`.
- **Accessibility**: WCAG 2.2 AA floor — keyboard-complete, visible focus,
  semantic landmarks, contrast-validated tokens, captions/transcript fields
  enforced by the content model.
- **No generic LMS template.** No card-grid-of-courses-with-progress-donuts
  default; surfaces are designed from the questions users bring
  ("what's next", "where are learners stuck"), not from CRUD symmetry.

## 3. Component architecture

Layered, with hard dependency direction (lower layers never import higher):

1. **Design tokens** (`packages/ui` eventually): color (semantic, both
   modes), typography scale, space, radius, elevation, motion durations —
   emitted as CSS custom properties; tenant branding overrides a defined
   subset at runtime.
2. **Primitives**: button, input, select, switch, dialog, popover, panel,
   toast, tabs, table, skeleton — accessible behaviors (candidate bases:
   Radix/Base UI evaluated in Phase 2 ADR; abstraction stands regardless),
   styled with Tailwind + tokens.
3. **Platform patterns**: entity list w/ filters, detail-with-inspector
   layout, publish bar (draft state, validation, publish action), version
   history panel, permission-gated action surface, empty states, command
   registry.
4. **Domain components**: block renderers (one per block type per schema
   version — renderer registry mirrors the schema registry), block editors,
   path canvas node/edge components, attempt player, progress
   visualizations, credential card.
5. **Surface compositions**: the actual pages/routes assembling the above.

Rendering strategy: Server Components for content-heavy surfaces (lesson
player renders published versions server-side); client islands for
interactive blocks, editors, and canvases. The editor and canvas are
client-heavy by nature and lazy-loaded.

## 4. Route architecture (App Router)

```
/(platform)     platform-admin surfaces (separate layout + auth boundary)
/(org)/[orgSlug]/
  admin/…       org administration
  studio/…      Learning Studio (authoring)
  a/[academySlug]/…   learner surfaces per academy
```

Org slug in the path anchors tenant resolution server-side on every request
(layout-level guard: membership + permission resolution, terminology +
branding token injection). Exact Next.js 16 conventions (layouts, route
groups, caching semantics) are validated against the local official docs
(`node_modules/next/dist/docs`) at each implementation phase — noted per the
Next 16 breaking-changes advisory in `apps/web/AGENTS.md`.
