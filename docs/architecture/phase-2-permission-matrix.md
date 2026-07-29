# Phase 2 Permission Matrix

Delta from the 29-code Phase 1D catalog. Full catalog:
`packages/domain/src/permissions.ts` (parity-tested); bundles in
`app.create_system_roles` (last revised in migration `20260729001411`).
The future-org parity test proves the owner bundle carries every catalog
code, so new organizations can never trail the catalog.

## New codes (29 → 32)

| Permission         | Owner | Admin | AcadAdmin | Author | Others |
| ------------------ | :---: | :---: | :-------: | :----: | :----: |
| `library.manage`   |   ✓   |   ✓   |     ✓     |   ✓    |   —    |
| `sources.manage`   |   ✓   |   ✓   |     ✓     |   ✓    |   —    |
| `ai.budget.manage` |   ✓   |   ✓   |     —     |   —    |   —    |

- **`library.manage`** — create/update/archive reusable blocks (linking
  a block into a lesson uses `content.author`). Authors get it: reuse is
  a core authoring act.
- **`sources.manage`** — manage AI source documents. Authors get it.
- **`ai.budget.manage`** — configure the org AI budget (platform-capped).
  Owner/admin only; budget visibility is also granted to `analytics.view`.

## Reused, unchanged

- **`ai.author.use`** gates generation (existing code) — Studio adds no
  new AI-generation permission, so an org cannot accidentally strip its
  authors of AI by role edits.
- **`content.author`/`content.publish`** gate the review request/decide
  split; **`content.view_draft`** is the Studio access floor.
- **`paths.manage`** gates path-node edits and canvas layout saves.
- **`integrations.manage`** gates webhook endpoints, deliveries, and
  manual retry.
- **`assessment.grade`** + uploader gate submission-file reads.

## Design notes

- Studio access is deliberately broad (`content.view_draft`) but every
  mutating action keeps its narrower permission — the shell is a
  convenience, never an authorization shortcut.
- No permission lets a tenant exceed the platform AI cap or mint new
  permission codes (both platform-owned).
- Seeds, existing-org backfill, and the seed-function revision shipped in
  ONE migration (`20260729001411`) — the progress.override defect class
  stays structurally closed.
