# Source Workspace

One place to put the material an organization builds from — documents, data,
images, and video — and the ingestion rules that keep it honest.

**Route:** `/{org}/admin/studio/sources` (nav: Knowledge → Authoring →
Sources). **Permission:** `sources.manage` to upload/approve/archive;
extracted sources surface to anyone who can use the AI workspace.

## What upload does

1. The file lands in the private `source-documents` bucket at
   `organizations/<org>/sources/<uuid>.<ext>` (path-scoped storage policies,
   signed URLs only — unchanged from Phase 2).
2. A `source_documents` row records the file: `mime_type`, `byte_size`,
   `original_filename`, provenance, and the extraction record.
3. **Text extraction runs where extraction is real** (`lib/ai/extract.ts`):
   PDF via the pdf.js text layer (`unpdf`), DOCX via `mammoth`, TXT/MD/CSV by
   decoding. Extracted text fills `content` (the AI-grounding field), capped
   at 100k chars — **truncation is recorded in `extraction_note`, never
   silent**, and `extracted_chars` keeps the honest pre-truncation size.
4. **Images and video are stored without claimed text** — no OCR and no
   transcription service is wired, and the extraction note says exactly that
   (`extraction_status = 'not_needed'`). A scanned PDF with no text layer
   records `failed` with the reason. Nothing in this pipeline fabricates
   content a file doesn't carry.

Accepted types and per-type caps live in `SOURCE_UPLOAD_LIMITS`
(documents 20MB, text 5MB, CSV 10MB, images 25MB, video 200MB; the bucket's
200MB limit and exact MIME list are the backstop). Migration:
`20260824154322_source_workspace_foundation`.

## Build-from-sources loop

Extracted sources appear in the AI workspace as attachable grounding — the
existing governed pipeline (budget reservation in cents, accept/reject,
audit) is unchanged. A source without extracted text cannot be attached as
grounding; the error names why.

## Provider

The `anthropic` adapter now uses the official `@anthropic-ai/sdk` and runs
**Claude Opus 5** (`claude-opus-5`) for every profile; `NOVAKORE_AI_MODEL`
overrides the model. Activation remains owner-controlled server env:

```
NOVAKORE_AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=<key>
```

Budget estimates use Opus 5 rates ($5/$25 per MTok) in integer cents; the
platform cap is unchanged. Until the key is set, the mock provider serves —
the workspace, extraction, and grounding flow work either way.
