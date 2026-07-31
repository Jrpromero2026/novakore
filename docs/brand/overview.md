# NovaKore Brand — Overview (v1.0)

<p align="center">
  <img src="../../apps/web/public/brand/logo-dark.svg" alt="NovaKore" width="420">
</p>

**NovaKore** · _Knowledge at the Core_

NovaKore is an enterprise technology company. It is **not** an LMS — it is
**learning infrastructure**: the modular, governed, white-labeled layer
beneath academies, journeys, assessments, and credentials. Every visual and
written surface communicates that.

## The identity

| Element  | Value                                                                                   |
| -------- | --------------------------------------------------------------------------------------- |
| Name     | NovaKore                                                                                |
| Tagline  | Knowledge at the Core                                                                   |
| Mark     | Six expanding modular arms around a central knowledge core                              |
| Gradient | Nova Purple `#8A3FFC` → Electric Indigo `#5A5CFF` → Core Blue `#2FB3FF`                 |
| Wordmark | "NovaKore", Inter semibold, tight tracking, single color (white on dark / ink on light) |

The mark encodes the brand attributes: knowledge (the core), growth
(expanding arms), connected systems and modular architecture (six modular
arms), intelligent infrastructure (the isometric core).

## Sources of truth

| Concern                 | Location                                             |
| ----------------------- | ---------------------------------------------------- |
| Brand tokens (TS)       | `packages/design-system` (`@novakore/design-system`) |
| CSS token projection    | `apps/web/src/app/globals.css` (parity-tested)       |
| Vector assets           | `apps/web/public/brand/*.svg`                        |
| Raster derivation       | `node scripts/brand-rasters.mjs`                     |
| In-app identity         | `apps/web/src/components/brand.tsx`                  |
| Tenant theming boundary | [tenant-theming.md](tenant-theming.md)               |

## Reading order

1. [voice.md](voice.md) — how NovaKore writes
2. [logo.md](logo.md) — the mark, variants, and usage
3. [colors.md](colors.md) — palette, semantic tokens, gradient rules
4. [typography.md](typography.md) — Inter / JetBrains Mono and type roles
5. [iconography.md](iconography.md) · [illustration.md](illustration.md)
6. [ui-principles.md](ui-principles.md) — how the product surface behaves
7. [dos-and-donts.md](dos-and-donts.md) — the quick audit sheet

Developer references retained from Phase 1B:
[novakore-brand-framework.md](novakore-brand-framework.md) (operational
framework), [design-tokens.md](design-tokens.md),
[logo-asset-specification.md](logo-asset-specification.md),
[tenant-theming.md](tenant-theming.md).

## Platform vs tenant identity

NovaKore identity appears only on platform surfaces (sign-in, organization
selector, platform errors, documentation, system email). Organization
surfaces render the organization's theme — the NovaKore mark is never
injected into tenant-themed shells, and tenants can never recolor the
NovaKore mark. Full matrix: framework §10.
