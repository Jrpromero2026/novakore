# Tenant Theming

How organizations customize their appearance without ever compromising the
platform. Implementation: `packages/domain/src/theme.ts` (schema +
resolver), `apps/web/src/components/org-theme.tsx` (application),
brand studio under `/{org}/admin/branding`.

## 1. Three layers, strict precedence

1. **NovaKore platform theme** — platform administration, sign-in and auth
   surfaces, organization selector, default org setup, unbranded fallback
   states, system emails, documentation, platform error states.
2. **Organization theme** — org admin shell, academy surfaces,
   member-facing app, org emails/certificates/exports (later phases).
3. **User preference** — light/dark/system via the theme toggle;
   accessibility display settings where supported.

Resolution: NovaKore base tokens → organization-approved overrides → user
mode → component state tokens. Tenant values are emitted as **scoped CSS
custom properties** through one code path (`OrgThemeStyle`); the platform
token definitions are never mutated globally.

## 2. What tenants may customize (bounded allow-list)

Via the versioned `tenantThemeSchema` (strict — unknown keys rejected):

- Accent color (light + dark variants); optional secondary accent
- Light background / dark background; surface tints (policy-bounded)
- Primary text color per mode (contrast-validated)
- Logo assets: horizontal, inverse, monogram, favicon, app icon
- Interface font — **approved catalog only** (Geist, Inter, System)
- Radius profile: `square` · `balanced` · `soft`
- Mode availability (`both` / `light` / `dark`) and default display mode
- Organization display name and terminology (existing systems)
- Email header styling, certificate identity, login presentation — data
  model reserved; rendering arrives with those features

## 3. What tenants may never do

Arbitrary CSS or JavaScript; remote executable assets; unsanitized SVG;
CSS injection through stored values; restyling authorization or security
states; overriding success/warning/danger/info/focus semantics; removing
required platform attribution; publishing themes that fail **blocking**
contrast checks.

Enforcement is layered: strict zod schema in the domain package → server
actions re-validate (client validation is advisory only) → database CHECK
constraints on legacy columns → render-time re-validation emits only exact
hex/enum values.

## 4. Contrast policy (implemented, measured)

WCAG 2.2 relative-luminance contrast is computed (`contrastRatio` in
`@novakore/domain`), not asserted:

- **Blocking (cannot publish):** accent vs its contrast text < 3.0;
  primary text vs its background < 4.5 (per mode).
- **Warning (publish allowed, flagged):** accent vs contrast text in
  [3.0, 4.5); secondary/soft pairings below 4.5.

The brand studio shows measured ratios per pairing in both modes.

## 5. Draft → publish workflow

- `theme_draft` (jsonb, versioned schema) — editable by
  `org.branding.manage`; nothing renders from drafts except the preview.
- **Preview** uses the same `resolveTheme()` as the live application — it
  is not a mockup.
- **Publish** — requires `org.branding.publish`; server re-validates the
  full theme, enforces blocking contrast, copies draft → `theme_published`,
  stamps `published_at`/`published_by`, and the change is audited
  (`branding.published`).
- **Revert** restores the draft from the last published configuration.
- Live surfaces resolve from `theme_published` only; organizations without
  a published theme fall back to NovaKore defaults safely.

## 6. Fallback behavior

Missing theme → platform defaults. Missing individual keys → per-key
fallback in the resolver. Missing logo assets → wordmark-from-name
rendering. A tenant can never be visually broken by absent branding.
