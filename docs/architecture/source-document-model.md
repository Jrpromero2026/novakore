# Source Document Model (Phase 2)

The minimum governed source foundation for AI authoring. Sources are the
ONLY tenant content sent to a provider.

## 1. `source_documents`

Org-scoped, `sources.manage` to write, `content.view_draft` to read.
Fields: title, `kind` (text | markdown | file), inline `content` (text/
markdown, ≤100k chars) OR `storage_path` (file, in the private
`source-documents` bucket), `content_hash` (SHA-256), `status`
(pending/ready/archived), `review_state` (unreviewed/approved),
`extraction_status`, and `provenance`. CHECK constraints enforce that
file sources have a path and non-file sources have content.

## 2. Governance

- Tenant isolation: org-scoped RLS + the `reserve_ai_generation` check
  that every referenced source belongs to the caller's org (proven by the
  isolation suite). No cross-tenant retrieval.
- Approval: `review_state` lets an org mark a source vetted before it
  grounds generations (advisory in Phase 2).
- Provenance + hash give traceability; the hash also dedupes identical
  pastes.

## 3. PDF extraction — honest limitation

File uploads (PDF/text/markdown) are stored in the private bucket, but
**automatic PDF text extraction is NOT implemented in Phase 2**. The
workspace states this; a file source with no extracted `content` cannot
ground a generation and the reserve step rejects it with a clear message.
When extraction lands it will populate `content`/`extraction_status`
without a schema change. Nothing claims a PDF was parsed when it was not.

## 4. What crosses to the provider

Only `{ title, excerpt }` for the sources the author explicitly attaches,
excerpt-capped at 20k chars, up to 5 sources. No other tenant data, no
member information, no unrelated documents.
