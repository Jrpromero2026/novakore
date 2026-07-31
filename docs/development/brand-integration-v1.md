# Brand Integration v1.0 — Final Report (2026-07-30)

Repository-wide implementation of the official NovaKore visual identity.
Scope discipline: additive and reversible; no business logic, API, schema,
auth, permission, learning-engine, RLS, or workflow changes. One deliberate
routing exception is documented in §9.

## 1. Logo assets (created)

Mark: six expanding modular arms + central knowledge core (isometric cube),
Nova Purple `#8A3FFC` → Electric Indigo `#5A5CFF` → Core Blue `#2FB3FF`.

Vectors (canonical) — `apps/web/public/brand/`:
`logo.svg` (adaptive via `prefers-color-scheme`), `logo-light.svg`,
`logo-dark.svg`, `logo-mono-white.svg`, `logo-mono-black.svg`, `icon.svg`,
`icon-light.svg`, `icon-dark.svg`, `icon-mono-white.svg`,
`icon-mono-black.svg`, `cover-social.svg`, `cover-presentation.svg`
(1920×1080), `cover-docs.svg` (banner), `splash.svg`,
`illustration-empty-state.svg`, `illustration-loading.svg`; plus
`apps/web/public/favicon.svg`.

Rasters (derived, reproducible via `node scripts/brand-rasters.mjs`):
`icon-192.png`, `icon-512.png`, `icon-maskable-512.png` (80 % safe zone),
`social-preview.png` (1200×630), `github-social.png` (1280×640),
`apps/web/src/app/apple-icon.png` (180×180),
`apps/web/src/app/favicon.ico` (16/32/48 PNG-in-ICO),
`apps/web/src/app/icon.svg`. Stock Next.js scaffold SVGs removed from
`public/`.

## 2. Design tokens (created)

`packages/design-system` (`@novakore/design-system`, npm workspace):
`brand.ts` (name, tagline, mission, vocabulary lists), `colors.ts`
(PALETTE incl. brand triad, BRAND_GRADIENT, SEMANTIC_COLORS per mode, WCAG
helpers, KNOWN_CONTRAST_EXCEPTIONS), `typography.ts` (Inter/JetBrains
Mono and type roles), `spacing.ts`, `radius.ts`, `shadows.ts`,
`motion.ts`, `icons.ts`, `logo.ts` (asset registry + minimum sizes),
`index.ts`, `tokens.test.ts` (16 tests). The CSS projection in
`globals.css` is **parity-tested** against the package; the logo registry
is existence-tested against disk; SVG sources are self-containment-tested.

New CSS tokens: `--brand-purple`, `--brand-indigo`, `--brand-blue`,
`--brand-gradient` (mode-invariant primitives; gradient use is restricted
per docs/brand/colors.md). Electric Indigo remains the sole interactive
accent — no existing semantic token changed value, so every QA-verified
surface renders exactly as before.

## 3. Application integration (updated)

- `components/brand.tsx` — official mark replaced the provisional monogram
  internals; identical component API (`NovaKoreMark` alias added), so
  sign-in, select-org, states, and 404 updated with zero consumer edits.
- `app/layout.tsx` — Inter promoted to platform primary, JetBrains Mono
  added for code (Geist stays loaded for the tenant font catalog);
  metadata: brand title/description, OpenGraph + Twitter cards
  (`/brand/social-preview.png`), optional `NEXT_PUBLIC_SITE_URL`
  metadataBase.
- `app/manifest.ts` — PWA manifest (name, Obsidian theme, 192/512 +
  maskable icons). `proxy.ts` allows anonymous manifest fetch.
- `app/page.tsx` — new platform landing: editorial hero (mark, tagline
  with single gradient accent, infrastructure voice), three capability
  sections (all copy states real capabilities only), footer. Authenticated
  users still forward to `/select-org`.
- `globals.css` — brand primitives + font token switch; everything else
  untouched.

## 4. Brand documentation (created)

`docs/brand/`: `overview.md`, `voice.md`, `logo.md`, `colors.md`,
`typography.md`, `illustration.md`, `iconography.md`, `ui-principles.md`,
`dos-and-donts.md` — with examples and file-level sources of truth.
Phase 1B docs retained; framework header + logo-spec §6 updated to record
v1.0 supersession. `README.md` rebranded (logo, tagline, mission, vision,
architecture). Voice sweep: no banned LMS/marketplace vocabulary on any
marketing or platform surface (the only matches are the rule definitions).

## 5. Accessibility verification

Automated (tokens.test.ts): primary text ≥ 4.5:1 on all six
backgrounds/surfaces per mode; secondary text ≥ 4.5:1; accent button
labels ≥ 4.5:1; accent + focus ring ≥ 3:1 non-text; focus-visible ring and
global `prefers-reduced-motion` collapse already in place. Live-verified:
dark (`#0B0B0D`/`#F2F3F7`) and light (`#F7F8FA`/`#101114`) modes both
resolve correctly; landing is semantically structured (banner/main/
regions/contentinfo, single h1).

**Known exception (pre-existing, now machine-recorded):** protected status
colors as small text on light backgrounds measure below AA (success ≈2.9,
warning ≈2.4, danger ≈4.3, info ≈3.5). Recorded in
`KNOWN_CONTRAST_EXCEPTIONS` with regression floors — see §10.

## 6. Build & test status

- format:check / lint / typecheck: clean, all workspaces.
- Tests: **318 passed** (web 62 · authorization 9 · database 94 ·
  design-system 16 new · domain 137). No existing test modified; coverage
  increased.
- `next build`: exit 0; `/apple-icon.png`, `/icon.svg`,
  `/manifest.webmanifest` registered as routes.

## 7. Live verification (dev server)

Landing, sign-in, 404 render the official mark; Inter active
(`Inter, Inter Fallback, system-ui`); `--brand-gradient` resolves; all
brand endpoints return 200 (`/manifest.webmanifest`, `/favicon.ico`,
`/icon.svg`, `/apple-icon.png`, `/brand/*`); manifest parses (name
NovaKore, theme `#0B0B0D`, 3 icons); zero console errors.
**Screenshots:** the embedded QA pane cannot composite frames (documented
environment limitation since Phase 1C) — per project policy screenshots
are not fabricated; a standard-browser click-through remains the owner
step, as with the alpha release gate. Rendered previews of every asset
were verified during generation (sharp rasters reviewed at 16–1200 px).

## 8. Files summary

Created: 17 brand SVGs + 5 brand PNGs + favicon.svg, `apple-icon.png`,
`app/icon.svg`, `app/manifest.ts`, `scripts/brand-rasters.mjs`,
`packages/design-system/*` (12 files), 9 brand docs, this report.
Updated: `components/brand.tsx`, `app/layout.tsx`, `app/page.tsx`,
`app/globals.css`, `app/favicon.ico` (replaced stock), `proxy.ts`,
`apps/web/package.json` (+design-system dep), root `package-lock.json`,
`README.md`, framework + logo-spec docs. Deleted: 5 stock scaffold SVGs.

## 9. Deliberate routing exception

`proxy.ts`: `/` is now public (the brand landing; the page forwards
authenticated users to `/select-org` — previously anonymous `/` bounced
straight to `/sign-in`), and `/manifest.webmanifest` is public (PWA
requirement). No protected content is exposed; every other path keeps the
exact prior behavior. Reversible by reverting two small hunks.

## 10. Recommendations for Brand Framework v2.0

1. **AA status colors (top priority):** raise light-mode status text
   ratios to ≥ 4.5:1 (e.g. success →`#0E7A3F`-range, warning
   →`#9A6700`-range, danger →`#C93434`-range, info →`#2563EB`-range).
   Touches domain `NOVAKORE_BASE`, tenant contrast gates, and QA'd status
   UI — a scoped phase of its own.
2. Wordmark as outlined vector paths (current lockup SVGs typeset Inter
   with system fallback; outlining removes font dependence in external
   contexts).
3. Email templates: none exist yet (Supabase default auth mail) — brand
   them when transactional email becomes first-class.
4. Storybook (listed in the brief) does not exist in this repo; if
   component previews become a need, seed it from the design-system
   package.
5. Fold brand tokens into tenant theme preview so organizations see their
   overrides against the v1.0 baseline.
6. Set `NEXT_PUBLIC_SITE_URL` when a production domain exists so OG/Twitter
   images resolve absolutely.
