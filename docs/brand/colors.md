# Color (v1.0)

Single source: `PALETTE` + `SEMANTIC_COLORS` in `@novakore/design-system`,
projected to CSS custom properties in `apps/web/src/app/globals.css`
(parity-tested by `packages/design-system/src/tokens.test.ts`). Components
consume **semantic tokens only** — never hex.

## Brand triad (the logo gradient)

| Name            | Hex       | Token / CSS                                 |
| --------------- | --------- | ------------------------------------------- |
| Nova Purple     | `#8A3FFC` | `PALETTE.novaPurple` · `--brand-purple`     |
| Electric Indigo | `#5A5CFF` | `PALETTE.electricIndigo` · `--brand-indigo` |
| Core Blue       | `#2FB3FF` | `PALETTE.coreBlue` · `--brand-blue`         |

`--brand-gradient` is the standard 135° sweep. **Gradient discipline:** the
gradient belongs to the platform mark, hero surfaces (one per page, at low
intensity), and hairline rules. It is never a component background, button
fill, text treatment for body copy, or status indicator. Electric Indigo
remains the single interactive accent (`--accent`); Nova Purple and Core
Blue are **not** interaction colors.

## Supporting neutrals

Midnight Black/Obsidian `#0B0B0D` · Carbon `#17181C` · Graphite `#24262B` ·
Ink `#101114` · White `#FFFFFF` · Soft Gray/Cloud `#F7F8FA` · Slate
`#7C8498` · Steel `#BFC6D5`.

## Semantic system

Backgrounds, surfaces, text, borders, accent states, focus, selection, and
the protected status colors (success / warning / danger / info) are defined
per mode in `SEMANTIC_COLORS` — see
[design-tokens.md](design-tokens.md) for the CSS-level reference. Dark
mode is first-class; light mode is fully specified, never a filter.

## Accessibility

Verified by automated tests (WCAG 2.1 AA):

- Primary text ≥ 4.5:1 on every background and surface, both modes.
- Secondary text ≥ 4.5:1 on base backgrounds, both modes.
- Accent button labels ≥ 4.5:1; accent and focus ring ≥ 3:1 non-text
  contrast against page backgrounds.

**Known exceptions (pre-v1.0, machine-checked):** the protected status
colors, rendered as small text on _light_ backgrounds, measure below AA
(success ≈ 2.9:1, warning ≈ 2.4:1, danger ≈ 4.3:1, info ≈ 3.5:1). They are
protected semantics used across QA-verified UI, so v1.0 records them in
`KNOWN_CONTRAST_EXCEPTIONS` (regression-floored) rather than re-skinning
status UI inside a branding phase. **Raising light-mode status text to AA
is the top Brand Framework v2.0 recommendation.** Dark-mode status colors
pass AA as text.
