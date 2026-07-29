# Reusable Content Library (Phase 2)

Save any block once, reuse it across lessons — without cross-tenant leaks
or uncontrolled shared-edit blast radius (ADR-021).

## 1. Model

`reusable_blocks`: org-owned, optional `academy_id` scope (null = shared
org-wide; set = that academy only, enabling cross-academy reuse only with
the org's own permission). Carries the block type, schema version,
validated `data`, tags (≤10), a monotonic `version`, and status
(active/archived). Registry-validated on save (`validateBlockData`).

## 2. Link vs copy

Inserting a library block into a lesson is explicit:

- **Link** — sets `content_blocks.source_reusable_block_id`. The lesson's
  draft references the shared source; updates to the reusable block flow
  into linked drafts on their **next publish** (published snapshots stay
  frozen — 1C immutability holds).
- **Copy** — inserts an independent block with no source reference; later
  changes to the library block do not affect it.

## 3. Controlled versioning

A trigger bumps `version` whenever `data` (or schema version) changes, so
every shared edit is a discrete, auditable revision. Usage is visible:
the library counts how many draft blocks link each source
(`source_reusable_block_id` FK), giving an impact preview before an author
publishes a shared change.

## 4. Isolation + lifecycle

- `library.manage` gates create/update/archive; `content.view_draft`
  gates read; `content.author` gates insertion into a lesson.
- Org-scoped FKs make cross-tenant references impossible; the isolation
  suite proves another tenant sees nothing.
- Archive is soft (status = archived, hidden from the picker); linked
  drafts keep their frozen copy.
- No public marketplace (out of scope, ADR-021).
