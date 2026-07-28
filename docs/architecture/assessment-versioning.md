# Assessment Versioning

The 1C publication model applied to assessments (ADR-007/008 + ADR-019).

## 1. Draft → immutable version

- Drafts (`assessments` + `assessment_items`) are freely editable by
  `assessment.author` holders and visible to `content.view_draft`.
- `publish_assessment` requires the distinct `assessment.publish`
  permission, freezes the ordered, registry-validated item array plus the
  settings snapshot (passing percent, time limit, retake policy) into
  `assessment_versions` with `version_number = max + 1`, and points
  `assessments.current_published_version_id` at it. Invalid item schemas
  block publication in the app layer (deep zod validation of every item)
  before the RPC's structural checks.
- Versions are immutable: the 1C `protect_immutable` trigger plus revoked
  grants plus absent write policies. Editing a draft after publication
  never mutates history.

## 2. What attempts pin

- `assessment_attempts.assessment_version_id` — the EXACT version seen.
- Responses reference items by their stable UUID inside that pinned
  version's snapshot; `save_assessment_response` rejects item ids outside
  it, so a response can never reference an item version the learner
  did not see.
- Per-attempt snapshots of `passing_percent`, `time_limit_minutes`, and
  `expires_at` — later setting changes never re-judge old attempts.

## 3. Assignments and retakes across versions

Assignments pin `assessment_version_id` at attach time (the current
published version). The explicit rule set:

- Existing attempts keep their pinned version forever.
- Future retakes use the ASSIGNMENT's pinned version — publishing a new
  assessment version changes nothing for already-attached content.
- Moving an assignment to a newer version is explicit: archive the
  assignment and attach again (one active assignment per
  (lesson, assessment) enforced by partial unique index). Documented in
  the editor UI.

## 4. Draft-vs-published display

The editor shows the published version badge (`v N · timestamp`) and the
next version number on the publish control. Item-level diffing keys on
stable item UUIDs with key-order-independent comparison (the 1C jsonb
lesson-diff lesson applies); Phase 1D ships version/status display and
defers a per-field item diff until authoring volume justifies it.

## 5. Item schema evolution

`(type, schemaVersion)` registry with stepwise pure migrations
(`migrateAssessmentItemData`), empty at v1 by design — unknown pairs fail
loudly. Published snapshots are never rewritten; renderers and graders
keep support for historical versions forever (ADR-008).
