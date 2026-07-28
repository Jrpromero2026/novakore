# NovaKore Design Tokens

Single source of truth for the token system. Implementation lives in
`apps/web/src/app/globals.css` (CSS custom properties + Tailwind `@theme`
mapping) and `packages/domain/src/theme.ts` (tenant-theme schema and the
shared resolver). Components consume Tailwind utilities mapped to semantic
tokens — **never raw hex**.

## 1. Resolution order (normative)

1. **NovaKore base tokens** — platform palette, both modes.
2. **Organization-approved theme overrides** — validated, bounded keys
   only (see [tenant-theming.md](tenant-theming.md)).
3. **User light/dark preference** — system preference by default,
   explicit override via the theme toggle (`data-theme`).
4. **Component state tokens** — hover/active/disabled derivations.

Protected semantic tokens (success, warning, danger, info, focus ring)
resolve from layer 1 only; layers 2–3 cannot touch them.

## 2. Color tokens (semantic)

| Token (CSS var)         | Dark value                | Light value               |
| ----------------------- | ------------------------- | ------------------------- |
| `--background`          | Obsidian `#0b0b0d`        | Cloud `#f7f8fa`           |
| `--background-elevated` | Carbon `#17181c`          | `#ffffff`                 |
| `--background-subtle`   | `#101114`                 | `#eff1f5`                 |
| `--surface`             | Carbon `#17181c`          | `#ffffff`                 |
| `--surface-elevated`    | `#1c1e23`                 | `#ffffff`                 |
| `--surface-interactive` | `#20232a`                 | `#eff1f5`                 |
| `--text-primary`        | `#f2f3f7`                 | `#101114`                 |
| `--text-secondary`      | Slate `#7c8498`           | `#4a5164`                 |
| `--text-muted`          | `#565d6e`                 | Slate `#7c8498`           |
| `--text-inverse`        | `#101114`                 | `#ffffff`                 |
| `--border-default`      | Graphite `#24262b`        | `#e3e6ec`                 |
| `--border-strong`       | `#33363e`                 | Steel `#bfc6d5`           |
| `--border-subtle`       | `#1c1e23`                 | `#edeff4`                 |
| `--accent`              | Electric Indigo `#5a5cff` | Electric Indigo `#5a5cff` |
| `--accent-hover`        | `#6d6fff`                 | Indigo Hover `#494be8`    |
| `--accent-active`       | Indigo Hover `#494be8`    | `#3f41d1`                 |
| `--accent-contrast`     | `#ffffff`                 | `#ffffff`                 |
| `--accent-soft`         | indigo @ 14%              | Indigo Soft `#ececff`     |
| `--focus-ring`          | `#7b7dff`                 | `#494be8`                 |
| `--selection`           | indigo @ 30%              | Indigo Soft               |
| `--success`             | `#2fc272`                 | `#18a957`                 |
| `--warning`             | `#e8ab3a`                 | `#d99614`                 |
| `--danger`              | `#e25858`                 | `#d63b3b`                 |
| `--info`                | `#5b9bf8`                 | `#3b82f6`                 |

(Dark status values are tone-adjusted for dark-surface contrast; both
derive from the semantic palette and are non-overridable.)

## 3. Typography tokens

Families: `--font-sans` (Geist Sans → system), `--font-mono` (Geist Mono →
ui-monospace). Tenant interface font substitutes `--font-sans` from the
approved catalog only.

| Role       | Utility        | Size / line-height | Weight   | Notes                                |
| ---------- | -------------- | ------------------ | -------- | ------------------------------------ |
| Display    | `text-display` | 30px / 1.15        | 600      | Page-level hero only                 |
| Heading 1  | `text-h1`      | 24px / 1.2         | 600      | Page titles                          |
| Heading 2  | `text-h2`      | 19px / 1.25        | 600      | Section titles                       |
| Heading 3  | `text-h3`      | 16px / 1.3         | 600      | Sub-sections                         |
| Title      | `text-title`   | 14px / 1.35        | 550      | Card/panel titles                    |
| Body       | `text-body`    | 14px / 1.55        | 400      | Default prose                        |
| Body small | `text-body-sm` | 13px / 1.5         | 400      | Dense admin copy                     |
| Label      | `text-label`   | 12px / 1.3         | 500      | Form labels, chips                   |
| Caption    | `text-caption` | 11px / 1.35        | 500      | Metadata; may be uppercase + tracked |
| Code       | `text-code`    | 13px / 1.5         | 450 mono | Identifiers                          |
| Numeric    | `tabular-nums` | inherits           | —        | Tables, counts                       |

Letter spacing: `0` everywhere except `--tracking-caps: 0.08em` for
uppercase captions/labels.

## 4. Spacing

4-point system via Tailwind's default scale (`1` = 4px). Arbitrary spacing
values require a code-review-visible justification comment; none exist
today.

## 5. Radius

`--radius-sm: 6px` · `--radius-md: 10px` · `--radius-lg: 14px` ·
`--radius-xl: 18px`, scaled by the tenant radius profile
(`square` ×0 · `balanced` ×1 · `soft` ×1.35). Containers default to
`md`; only overlays use `lg+`.

## 6. Shadows

`--shadow-raised` (1px + 12px quiet pair) and `--shadow-overlay`
(12px + 32px). Dark mode reduces shadow weight and leans on
`--border-default` + tonal separation.

## 7. Motion

`--motion-fast: 140ms` · `--motion-standard: 200ms` ·
`--motion-slow: 300ms`; `--ease-out: cubic-bezier(0.16,1,0.3,1)`,
`--ease-in-out: cubic-bezier(0.65,0,0.35,1)`. All motion collapses under
`prefers-reduced-motion` (global rule).

## 8. Layout tokens

| Token               | Value                                                  |
| ------------------- | ------------------------------------------------------ |
| `--layout-page-max` | 72rem (1152px) admin content max                       |
| `--layout-form-max` | 42rem forms/reading                                    |
| `--layout-gutter`   | 20px mobile · 24px desktop                             |
| `--layout-sidebar`  | 13rem admin nav                                        |
| `--layout-header`   | 3.25rem                                                |
| Breakpoints         | Tailwind defaults: sm 640 · md 768 · lg 1024 · xl 1280 |
| Table density       | rows 44px standard (density profiles deferred)         |

## 9. Z-index layers (named — no arbitrary numbers)

`--z-nav: 30` · `--z-panel: 40` · `--z-overlay: 50` · `--z-toast: 60`.

## 10. Compatibility note

Phase 1A utility names (`bg-surface`, `text-text`, `text-text-muted`,
`border-border`, …) remain mapped onto the new semantic variables so the
existing component code stays valid; new code should prefer the semantic
names in §2. The mapping lives in one place (`globals.css @theme`).
