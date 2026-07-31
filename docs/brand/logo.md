# Logo (v1.0)

The official NovaKore mark: **six expanding modular arms** around a
**central knowledge core** (isometric cube), sweeping the brand gradient
Nova Purple → Electric Indigo → Core Blue, with a clean single-color
wordmark set in Inter semibold.

This supersedes the Phase 1B provisional monogram. Per the asset-slot
contract ([logo-asset-specification.md](logo-asset-specification.md) §6),
the final vectors replaced the provisional component internals in
`apps/web/src/components/brand.tsx` without any consumer rewrites.

## Files

Vector sources (canonical) live in `apps/web/public/brand/`:

| File                                      | Use                                                           |
| ----------------------------------------- | ------------------------------------------------------------- |
| `logo.svg`                                | Adaptive horizontal lockup (wordmark follows color scheme)    |
| `logo-light.svg` / `logo-dark.svg`        | Lockup for light / dark backgrounds (static)                  |
| `logo-mono-white.svg` / `-mono-black.svg` | Single-color lockups (print, embossing, constrained contexts) |
| `icon.svg`                                | Square mark, transparent — favicons, avatars                  |
| `icon-light.svg` / `icon-dark.svg`        | Mark on Cloud / Obsidian rounded tile — app icons             |
| `icon-mono-white.svg` / `-mono-black.svg` | Single-color marks                                            |
| `cover-social.svg`                        | Social/OG composition source                                  |
| `cover-presentation.svg`                  | 1920×1080 presentation cover                                  |
| `cover-docs.svg`                          | Documentation banner                                          |
| `splash.svg`                              | App splash / loading screen composition                       |

Raster deliverables (`icon-192/512.png`, `icon-maskable-512.png`,
`social-preview.png`, `github-social.png`, `apple-icon.png`,
`favicon.ico`) are **derived** — regenerate with:

```bash
node scripts/brand-rasters.mjs
```

Never hand-edit a raster. Edit the SVG source, then regenerate.

## In-app rendering

Use the components — never ad-hoc `<img>` tags:

- `NovaKoreMark` / `NovaKoreMonogram` — the mark (inline SVG, gradient
  stops resolve from the mode-invariant `--brand-*` tokens)
- `NovaKoreWordmark` — typeset wordmark, token-driven color
- `PlatformMark` — standard header lockup (mark + wordmark)

## Usage rules

- Minimum sizes: lockup ≥ 24 px tall, mark ≥ 16 px (`LOGO_MIN_SIZES`).
- Clear space around the lockup: ≥ 25 % of the mark height on all sides.
- The gradient belongs to the mark. Do not recolor the mark with tenant
  colors, status colors, or a single accent; monochrome variants exist for
  constrained contexts.
- The wordmark is one color — never gradient-filled, never two-tone.
- Do not rotate, outline, shadow, or animate the mark ambiently; motion is
  allowed only as a state-change cue within motion-token durations.
- On photography or busy surfaces, use a tile variant (`icon-light` /
  `icon-dark`), never the bare mark.
- The core cube's face colors are fixed artwork — identical in every theme.
