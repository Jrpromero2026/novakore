# Media and Storage (Phase 2, as built)

Three distinct private buckets extend the ADR-015 media architecture for
Studio content and learner submissions.

## 1. Buckets (all private, signed URLs only)

| Bucket                   | Contents                | Read                          | Write               | MIME                               | Size  |
| ------------------------ | ----------------------- | ----------------------------- | ------------------- | ---------------------------------- | ----- |
| `lesson-media`           | lesson images/audio/pdf | org members                   | `content.author`    | png/jpeg/webp, mpeg/mp4 audio, pdf | 50 MB |
| `source-documents`       | AI source files         | `content.view_draft`          | `sources.manage`    | pdf, text, markdown                | 20 MB |
| `assessment-submissions` | learner uploads         | uploader + `assessment.grade` | uploader (own path) | pdf, png, jpeg, text               | 50 MB |

Owner decision 7: learner submissions never share lesson-media storage.
No SVG in any of these — the 1B branding gate remains the platform's only
SVG path.

## 2. Path-scoped policies

Deterministic tenant paths with strict deny-on-malformed parsers
(`app.lesson_media_org_id`, `app.source_document_org_id`,
`app.submission_org_id/_membership_id`):

- `organizations/<org>/lesson-media/<file>`
- `organizations/<org>/sources/<file>`
- `organizations/<org>/submissions/<membership>/<attempt>/<file>` —
  uploaders may write ONLY under their own membership path; readers are
  the uploader and graders.

No UPDATE/DELETE object policies: uploads are immutable; replacement
writes a new path. `media_assets` remains the metadata record of truth
(kinds and buckets extended); submission files record to
`assessment_submission_files` via `register_submission_file`, which
rejects paths that do not match the caller's own attempt.

## 3. Signed URLs in the renderer

Governed media blocks (image/audio/pdf) reference an `assetId`, never a
URL. `resolveMediaUrls` (server, under the caller's RLS session) signs
short-lived (1h) URLs per render — signing requires SELECT on the object,
so cross-tenant references resolve to nothing (fail closed). The ONE
trusted renderer takes a `mediaUrls` map and renders images inline, audio
with a player, and PDFs as download cards; a missing URL degrades to a
labeled placeholder.

## 4. Preview

Learner preview, tenant-theme preview, and the lesson-editor preview all
render through the SAME block renderer — no separate unsafe preview.
Viewport/theme previews use the existing responsive + theme system.

## 5. Orphan cleanup + retention

- Upload → metadata is transactional-adjacent: `uploadLessonMediaAction`
  removes the storage object if the `media_assets` insert fails
  (orphan-prevention).
- Retention: media follows the asset lifecycle (active → replaced/
  archived); submissions follow the attempt. A scheduled sweep for stale
  `pending` rows remains a documented operator action until the job runner
  is generalized (carried from 1B).

## 6. File submissions (still guarded)

The `file_submission` assessment item keeps its Phase 1D guarded state in
the learner UI (plain-text submission note). The bucket, metadata table,
and `register_submission_file` RPC now exist so real uploads can be wired
without schema change; the learner upload control is the remaining piece
(deferred, documented).
