# NovaKore Brand Framework

Operational brand reference for NovaKore. Everything here maps to
implemented tokens, components, or policy — nothing is aspirational prose.
Developer mapping: [design-tokens.md](design-tokens.md) ·
[tenant-theming.md](tenant-theming.md) ·
[logo-asset-specification.md](logo-asset-specification.md).

> **Brand Integration v1.0 (2026-07-30):** the official visual identity is
> live — see [overview.md](overview.md) for the v1.0 doc set (logo, colors,
> typography, voice, iconography, illustration, UI principles). Where this
> framework and the v1.0 docs differ (official mark replacing the
> provisional monogram; Inter as primary interface face; the brand
> gradient triad), **v1.0 governs**.

## 1. Product distinction: NovaKore is not Knovacora

**NovaKore** is B2B software infrastructure: the platform that powers
professional education, academies, certifications, learning, assessments,
coaching, permissions, analytics, automation, and white-labeled
organizational experiences.

**Knovacora** is a separate, future education ecosystem — marketplace,
discovery, professional network — that may eventually be _powered by_
NovaKore. Knovacora branding, marketplace concepts, public discovery,
social networking, and creator-economy language are **prohibited** in
NovaKore code, UI copy, and documentation. NovaKore reads as enterprise
infrastructure, never as a consumer course marketplace.

## 2. Positioning and attributes

NovaKore represents: infrastructure, precision, reliability, intelligence,
structure, standards, scalability, longevity, quiet authority, technical
excellence.

The product feels: premium, minimal, enterprise-grade, **dark-first but
fully complete in light mode**, technical without sterility, structured
rather than decorative, modern without trend-chasing, confident without
marketing inflation.

Reference quality (never copied): Linear, Vercel, Stripe, Raycast, Retool,
GitHub.

## 3. Voice principles

- Direct, professional, specific. Say what a thing does.
- Preferred vocabulary: organizations, academies, members, permissions,
  roles, publish, review, certify, configure, operate, scale,
  infrastructure, standards.
- Banned vocabulary: creators, fans, "grow your tribe", "amazing learning
  journey", supercharge, revolutionary, "all-in-one magic", gamified fun,
  social marketplace.
- Tenant-facing entity words always pass through the terminology resolver;
  canonical entity names never change in code or schema (ADR-003).
- Uppercase only for labels, metadata, and short navigational cues.

## 4. Color system

Named platform palette (single source: `globals.css` primitives →
semantic tokens; never hardcode hex in components):

| Name            | Hex       | Role                                       |
| --------------- | --------- | ------------------------------------------ |
| Obsidian        | `#0B0B0D` | Primary dark background                    |
| Carbon          | `#17181C` | Dark surfaces, elevated panels             |
| Graphite        | `#24262B` | Borders, secondary surfaces, layered depth |
| White           | `#FFFFFF` | Inverse text, clean surfaces               |
| Cloud           | `#F7F8FA` | Primary light background                   |
| Electric Indigo | `#5A5CFF` | Primary interactive accent                 |
| Indigo Hover    | `#494BE8` | Hover / pressed accent                     |
| Indigo Soft     | `#ECECFF` | Light-mode tinted accent surface           |
| Slate           | `#7C8498` | Secondary text                             |
| Steel           | `#BFC6D5` | Muted borders, inactive states             |

Semantic status colors (protected — tenants can never override them):
Success `#18A957` · Warning `#D99614` · Danger `#D63B3B` ·
Information `#3B82F6`.

## 5. Typography

- Interface/display: **Geist Sans**. Body fallback: system sans stack.
  Code/technical identifiers: **Geist Mono**.
- Tenant font selection comes only from the approved catalog
  (`FONT_CATALOG` in `@novakore/domain`): Geist, Inter, System. No
  arbitrary external font URLs, ever.
- Type roles are tokens (display, h1–h3, title, body, body-small, label,
  caption, code, numeric/tabular) — see design-tokens.md §3.
- Letter spacing is restrained; tracking is applied only to uppercase
  labels/metadata.

## 6. Logo architecture

Slots (platform + tenant) are defined in
[logo-asset-specification.md](logo-asset-specification.md): primary
horizontal, inverse horizontal, monogram, favicon, app icon, email logo —
each with a tenant equivalent.

**Provisional-mark disclaimer:** the current NovaKore mark is a _text
wordmark plus a clearly labeled provisional monogram_ implemented as code
components (`NovaKoreWordmark`, `NovaKoreMonogram`). It is **not** a final
trademarked logo. Final vector files replace the provisional components via
the asset slots without rewriting consumers.

## 7. Iconography, photography, illustration

- Iconography: geometric, stroke-consistent, functional. No decorative
  icon noise; icons accompany labels, they don't replace them.
- Photography/illustration: none in the product shell. No stock education
  imagery, no cartoon illustration, no consumer-social aesthetics.
  Documentation may use neutral diagrams (Mermaid).

## 8. Motion

Tokens: fast 140 ms, standard 200 ms, slow 300 ms; ease-out for entrances,
ease-in-out for state changes. Motion communicates state change or spatial
continuity only — no bounce, no ambient animation. `prefers-reduced-motion`
collapses all motion (implemented globally).

## 9. UI principles

- Structure over decoration; density tuned for administration.
- Dark-first design, light mode fully specified — never a filter.
- Side panels and inline editing over modal chains.
- Restrained radii (6–18 px scale); shadows are layered and quiet; dark
  mode separates with borders and tone, not glow.
- Empty states explain and offer the next action; errors are specific.
- Avoid: generic LMS visuals, glassmorphism-everywhere, neon cyberpunk,
  oversized radii, dashboard clutter, excessive gradients.

## 10. Platform vs tenant branding boundary

| Surface                                             | Identity                          |
| --------------------------------------------------- | --------------------------------- |
| Sign-in, magic link, auth errors                    | NovaKore platform                 |
| Organization selector, no-organization state        | NovaKore platform                 |
| Platform administration (future)                    | NovaKore platform                 |
| System emails, documentation, platform error states | NovaKore platform                 |
| Unbranded/fallback tenant states                    | NovaKore platform defaults        |
| Org admin shell, academy surfaces, member app       | Organization theme                |
| Org emails, certificates, exported documents        | Organization theme (later phases) |

Rules: tenant themes never mutate platform token definitions globally;
they resolve as scoped overrides (precedence in
[tenant-theming.md](tenant-theming.md)); security, error, warning, and
system-critical semantics keep protected contrast in every tenant theme;
tenants cannot restyle authorization states or security warnings.

## 11. Correct / incorrect usage

Correct: wordmark on Obsidian or Cloud with token-driven contrast; accent
used for primary interaction only; one accent per surface; status colors
reserved for status.

Incorrect: recoloring the platform mark with tenant colors; accent used as
decorative wash; status colors as brand colors; hardcoding any palette hex
in a component; presenting the provisional monogram as a final logo.
