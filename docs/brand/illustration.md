# Illustration (v1.0)

NovaKore's product shell uses **no illustration**: no stock education
imagery, no cartoon characters, no consumer-social aesthetics. The brand
reads as infrastructure — restraint is the style.

## What is allowed

| Context                | Treatment                                                        |
| ---------------------- | ---------------------------------------------------------------- |
| Empty states           | Geometric brand-derived glyphs (see below), muted, token-colored |
| Loading states         | Skeletons (primary) or the loading glyph                         |
| Documentation          | Neutral diagrams (Mermaid), brand covers                         |
| Presentations / social | The cover compositions in `apps/web/public/brand/`               |

## Provided assets

- `apps/web/public/brand/illustration-empty-state.svg` — outlined knowledge
  core with muted arms; inherits `currentColor` for the neutral strokes so
  it sits correctly on any token background.
- `apps/web/public/brand/illustration-loading.svg` — one gradient arm among
  muted arms; static by design (motion, if any, is applied by CSS within
  motion tokens and collapses under `prefers-reduced-motion`).

## Rules

- Illustrations derive from the mark's geometry (arms, core, hexagonal
  chamfers) — never introduce a second visual language.
- Muted first: neutral strokes at low opacity, at most one gradient or
  accent element per illustration.
- Never use illustrations to soften errors or security warnings; those
  surfaces stay typographic and specific.
