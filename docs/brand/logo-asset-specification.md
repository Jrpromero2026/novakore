# Logo & Asset Specification

## 1. Slots

Platform (NovaKore) and tenant slots are symmetric. Platform assets are
repo-owned (components/static files, versioned in git); tenant assets are
uploads governed by the media pipeline.

| Slot                    | `asset_kind`              | Formats        | Max size | Dimension guidance                                     |
| ----------------------- | ------------------------- | -------------- | -------- | ------------------------------------------------------ |
| Primary horizontal logo | `logo_horizontal`         | SVG, PNG, WebP | 2 MB     | ≥ 240×64 raster; ~3–5:1 aspect; transparent background |
| Inverse horizontal logo | `logo_horizontal_inverse` | SVG, PNG, WebP | 2 MB     | same as primary, tuned for dark surfaces               |
| Monogram                | `monogram`                | SVG, PNG, WebP | 2 MB     | square, ≥ 128×128                                      |
| Favicon                 | `favicon`                 | SVG, PNG, ICO  | 512 KB   | square, ≥ 48×48 (ICO only for legacy compatibility)    |
| Application icon        | `app_icon`                | PNG, WebP      | 2 MB     | square, ≥ 512×512                                      |
| Email logo              | `email_logo`              | PNG, WebP      | 2 MB     | raster only (email client support); ≥ 240 px wide      |

Content images (`content_image`, Phase 1C+): JPEG/PNG/WebP, 8 MB, max
6000×6000.

Limits exist for: abuse prevention (storage cost, decompression bombs),
email/browser compatibility (raster email logos, ICO favicons), and
render quality floors (minimum dimensions). Constants live in
`ASSET_POLICY` (`@novakore/domain`) — no magic numbers in code.

## 2. Rejected formats

Executables, HTML, JavaScript, CSS, unverified XML, animated formats
(GIF/APNG/animated WebP) unless specifically approved later, and any
extension/MIME mismatch. Validation checks MIME type, extension, byte
size, and decoded pixel dimensions server-side.

## 3. SVG policy (hostile input)

SVG is accepted **only** for branding slots, only from organization
branding managers, and passes a strict reject-not-rewrite gate:

- rejected outright: `<script>`, event-handler attributes (`on*=`),
  `javascript:` URLs, `<foreignObject>`, external references
  (`href`/`xlink:href` beyond `#fragment`), `<image>`, embedded
  `<style>` with `@import`/`url(`, DOCTYPE/entity declarations, processing
  instructions.
- Rendering is exclusively via `<img src>` (never inlined into the DOM),
  which prevents script execution even in a bypass scenario.
- Served from private buckets through signed URLs.

## 4. Storage layout

Deterministic tenant-scoped paths — original filenames never provide
uniqueness:

`organizations/{organization_id}/branding/{asset_kind}/{asset_id}/{sanitized_filename}`

Buckets: `org-branding` (tenant brand assets, private) and
`platform-branding` (reserved for final platform vector delivery,
private, platform-managed only). Cross-tenant path writes are blocked by
storage RLS (path org segment must match an org where the caller holds
`org.branding.manage`).

## 5. Lifecycle

`pending` (metadata row created, upload in flight) → `active` (exactly one
per (org, kind), enforced by partial unique index) → `replaced` (prior
active on replacement; metadata retained for audit) → `archived`.
`failed` marks aborted uploads. Replacement never deletes history rows.
Stale `pending` rows older than 24h are abandonable; cleanup strategy
documented in [../architecture/media-assets.md](../architecture/media-assets.md).

## 6. Platform mark (final — Brand Integration v1.0)

Final vector delivery landed 2026-07-30: the official mark (six expanding
modular arms + central knowledge core, purple → indigo → blue gradient)
replaced the provisional monogram's internals in
`apps/web/src/components/brand.tsx` exactly as this contract specified —
same components, same props, zero consumer rewrites. Canonical vectors
live in `apps/web/public/brand/`; rasters are derived via
`scripts/brand-rasters.mjs`. Usage rules: [logo.md](logo.md).
