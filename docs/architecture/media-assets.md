# Media Assets Architecture (D-07)

Resolves owner decision **D-07**. ADR-015 records the decision; this
document is the implementation reference.

## 1. Decision

Supabase Storage for binaries + a governed `media_assets` metadata table.
No binary data or large data URLs in relational columns. Private buckets
by default; controlled serving via signed URLs. Phase 1B scope: branding
assets only; content images reuse the same pipeline in Phase 1C.

## 2. Buckets

| Bucket              | Visibility | Purpose                                   | Writers                                          |
| ------------------- | ---------- | ----------------------------------------- | ------------------------------------------------ |
| `org-branding`      | private    | Tenant brand assets                       | Org branding managers (storage RLS, path-scoped) |
| `platform-branding` | private    | Final NovaKore vector delivery (reserved) | Platform only (no tenant policies)               |

Not created (deliberately): public convenience buckets, user-upload and
temp buckets (no current requirement — added when a feature needs them,
per the no-premature-abstraction rule).

Bucket-level `file_size_limit` and `allowed_mime_types` provide a coarse
platform ceiling; the authoritative per-kind policy is `ASSET_POLICY` in
`@novakore/domain`, enforced in the server layer.

## 3. `media_assets` (metadata of record)

Canonical columns: `id`, `organization_id` (nullable **only** for
platform-owned assets), `academy_id` (nullable), `owner_user_id`
(nullable), `asset_kind`, `storage_bucket`, `storage_path` (unique),
`original_filename`, `mime_type`, `byte_size`, `width`, `height`,
`alt_text`, `status` (`pending|active|replaced|archived|failed`),
`checksum` (sha-256 hex), `replaced_by_asset_id`, `created_at`,
`updated_at`, `created_by`, `archived_at`.

Key constraints:

- Partial unique index on `(organization_id, asset_kind)` where
  `status = 'active'` — the _current_ asset per slot is a query, not a
  mutable FK; replacement flips the predecessor to `replaced` and links
  `replaced_by_asset_id` (auditability requirement).
- `storage_path` must embed the owning organization id (CHECK), so a
  metadata row can never point at another tenant's object.
- Audited by the standard `app.audit_change` trigger.

## 4. Path convention

`organizations/{organization_id}/branding/{asset_kind}/{asset_id}/{sanitized_filename}`

- `asset_id` guarantees uniqueness; original filenames are display-only
  and sanitized (safe charset, length-capped) before use in paths.
- Storage RLS derives the org from path segment 2 and requires
  `app.has_org_permission(org, 'org.branding.manage')` for writes and
  org membership for reads — relational RLS and storage policies agree by
  construction and are both tested.

## 5. Upload pipeline (server-only)

1. Server action authenticates, resolves org context, checks `can()`.
2. Validates: asset kind, MIME + extension agreement, byte size vs
   `ASSET_POLICY`, decoded pixel dimensions (header parsing via
   `image-size`), SVG hostile-input gate (reject-not-rewrite; see
   logo-asset-specification.md §3).
3. Inserts `media_assets` row (`pending`) under RLS.
4. Uploads bytes with the **user's session client** (storage RLS
   enforced; the service-role key is not used).
5. Marks the row `active`; flips the previous active row of that kind to
   `replaced` with `replaced_by_asset_id`.
6. Failure at any step marks the row `failed`; audit trail preserved.

Serving: admin surfaces request short-lived signed URLs (1 h) through the
user's client — a user who cannot SELECT the object cannot sign it.

## 6. Cleanup strategy

`pending`/`failed` rows older than 24 h are eligible for cleanup. Phase 1B
ships the documented query (`status in ('pending','failed') and
created_at < now() - interval '24 hours'`) as an operator action; a
scheduled job adopts it when the platform gains its job runner (Phase 1C
outbox infrastructure). Storage objects without an active/replaced
metadata row are orphans and safe to delete.

## 7. Security posture

- MIME spoofing: extension, declared MIME, and decoded image type must
  agree; undecodable images are rejected.
- Path traversal: paths are constructed server-side from validated UUIDs
  and a sanitized basename; user input never contributes path segments.
- Decompression bombs: dimension caps (6000×6000) + byte caps; decode
  failures reject.
- Stored XSS: filenames and alt text are length-capped, control-character
  stripped, and always rendered as text (React escaping); SVG gate above.
- Cross-tenant: storage RLS + metadata RLS + path CHECK, covered by the
  real isolation suite.
