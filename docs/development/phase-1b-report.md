# Phase 1B Implementation Report

Completed 2026-07-28. Brand system, design tokens, theming architecture,
and media foundation. Baseline: Phase 1A complete (60 tests, clean tree at
`075e7f1`).

## 1. Decisions

- **D-07 resolved (ADR-015):** Supabase Storage + governed `media_assets`
  metadata; private buckets; signed URLs; per-kind `ASSET_POLICY`
  constants; SVG as hostile input (reject-not-rewrite + img-only
  rendering); replacement retains history.
- **D-08 resolved (ADR-016):** supabase-js + generated types + per-domain
  data modules + zod + `can()` + RLS. No ORM/GraphQL. Nine-step mutating
  contract documented in
  [../architecture/data-access-layer.md](../architecture/data-access-layer.md).

## 2. Delivered

| Area              | Result                                                                                                                                                                                                                                                                                       |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Token system      | Official NovaKore palette (Obsidian/Carbon/Graphite/Cloud/Electric Indigo + semantic status), dark-first with complete light mode; typography roles, spacing/radius/shadow/motion/layout/z-index tokens; Phase 1A utility aliases preserved.                                                 |
| Theme layering    | Platform base → org overrides → user preference → state tokens. One resolver (`resolveThemeTokens`) shared by live app AND preview. Protected semantics unreachable by tenant input **by construction**.                                                                                     |
| Tenant theming    | Strict versioned `tenantThemeSchema` (unknown keys rejected); font catalog (Geist/Inter/System); radius profiles; measured WCAG contrast with blocking (accent ≥3.0, text ≥4.5) vs warning levels.                                                                                           |
| Media             | `media_assets` table, `org-branding`/`platform-branding` private buckets, path-scoped storage RLS agreeing with relational RLS, deterministic tenant paths, pending→active→replaced→archived lifecycle.                                                                                      |
| Brand studio      | Status/publish bar, structured color roles with live contrast, catalog typography, shape profiles, six asset slots with upload/replace/archive + confirmation, resolver-driven dual-mode preview, draft → validate → publish (permission-gated, audited) → revert.                           |
| Platform identity | Provisional wordmark + labeled monogram (documented as non-final), applied to platform surfaces; designed 404; loading skeletons.                                                                                                                                                            |
| Permissions       | One addition: `org.branding.publish` (owner/admin bundles; provisioning updated). All other needs reuse existing codes — documented in the permission matrix.                                                                                                                                |
| Components        | Alert, Skeleton, ConfirmButton (now guarding member removal + academy archive), ColorField, ContrastIndicator, ThemePreview, AssetSlot — all with real consumers. The remainder of the long component wishlist stays deferred under the no-premature-abstraction rule until consumers exist. |

## 3. Database

- Migration `20260728151839_brand_media_foundation` (applied to
  novakore-dev; history in sync with files): `media_assets` + RLS + audit,
  theme draft/publish columns on `organization_branding`, publish
  permission, buckets + storage policies,
  `app.storage_path_org_id` (strict path parser, null on malformed input).
- Seeds: published themes for Alpha and BFH dev tenant; **Gamma Research
  Institute** as the incomplete-branding fallback fixture; invalid values
  exist only in tests, never in seed state.

## 4. Issues found and fixed by the gates (this phase)

1. **Legacy-default misread (browser QA):** an untouched Phase 1A branding
   row rendered old default accents as if tenant-chosen; fallback now
   detects untouched legacy defaults → NovaKore platform theme.
2. **Radius/font attributes dead since 1A (code audit):** data-attributes
   were set on a div while CSS targeted `:root`; profiles now flow through
   the validated style emission and demonstrably apply (BFH `soft` ×1.35
   verified live).
3. **Revert didn't reset editor state (browser QA):** the action now
   returns the reverted theme and the studio resynchronizes.
4. **Control-character regex corruption (tooling):** a validation regex was
   written with literal control bytes; replaced with plain code filtering.

## 5. Security review (Phase 1B additions)

| Threat                          | Defense (verified by)                                                                                                                                             |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CSS injection                   | Strict hex/enum schema → emitter re-check → only `--var:#hex` declarations possible (unit tests with attack strings)                                              |
| SVG script injection            | Reject-not-rewrite gate (scripts, handlers, foreignObject, external refs, DOCTYPE/entities, style imports) + img-only rendering + private bucket (6 attack tests) |
| Path traversal                  | Server-built paths from validated UUIDs + sanitized basenames; storage parser nulls malformed paths (real-storage test)                                           |
| MIME spoofing                   | Declared type vs magic bytes vs extension must all agree (tests incl. HTML-as-PNG/SVG)                                                                            |
| Cross-tenant asset read/replace | Storage RLS + metadata RLS + path CHECK binding (10-test real suite)                                                                                              |
| Unauthorized publication        | `org.branding.publish` + server-side contrast blocking (UI test + action check)                                                                                   |
| Oversized payloads / bombs      | Byte caps per slot + 6000×6000 decode caps + decode-failure rejection                                                                                             |
| Stored XSS via filename/alt     | Sanitized charset, control-char strip, length caps, React-escaped rendering                                                                                       |
| Signed URL reuse across tenants | Signing requires SELECT on the object; cross-tenant signing fails (real test)                                                                                     |
| Platform asset modification     | `platform-branding` has zero tenant policies; metadata rows with null org invisible to tenants (real tests)                                                       |
| Service-role exposure           | Still never obtained or used anywhere.                                                                                                                            |

## 6. Verification

- 109 tests green: 32 web · 9 authorization · 32 database (22 + 10 against
  the real novakore-dev instance, zero mocks) · 36 domain.
- `npm run verify` green end-to-end; production build 13 routes + proxy.
- Browser QA on the real dev project: draft isolation, live preview
  parity, publish → immediate live token change, blocking-contrast
  lockout with measured ratios, revert, fallback tenant, BFH terminology +
  accent + radius, learner denial, cross-tenant 404, light+dark, mobile
  (no overflow), zero console/hydration errors, zero broken images.
- **QA environment note:** the embedded QA browser pane does not composite
  frames, which starves React 19.2's animation-frame-batched Suspense
  reveal; QA scripts force the pending reveal (`$RV`). Verified as an
  artifact of the headless pane, not an application defect.

## 7. Deferred

- Email header styling / certificate identity / login-screen presentation
  rendering (data model reserved; features arrive with their phases).
- Density profiles; broad component wishlist items without consumers
  (tooltips, popovers, menus, drawers, toasts, pagination, breadcrumbs,
  tabs-as-shared-primitive).
- Scheduled cleanup job for stale pending uploads (documented operator
  query until the Phase 1C job runner exists).
- Platform-branding bucket population (awaits final logo delivery).
- Terminology copy-lint for hardcoded entity nouns.

## 8. Manual / unverified items

- Leaked-password protection: **still OFF** (dashboard-only toggle).
- SMTP: Supabase built-in (rate-limited) — unchanged, fine for dev.
- Auth URL configuration: dashboard values assumed from Phase 1A setup —
  **unverified this phase** (magic-link email flow not exercised).
- Storage CORS / image transformation config: defaults in use; nothing
  required them — **unverified**.
- Custom domain, final font licensing, final logo vectors: not applicable
  yet; owner-supplied later.
- Docker: still not installed; remote-dev strategy remains the verified
  testing path.
