# KNOWLEDGE_MODEL

Knowledge is structured, versioned, and validated — never freeform HTML.

## Hierarchy

Journey (learning_path, audience-tagged) → path_nodes → Course → Module →
Lesson → Content blocks (finite validated types, `contentBlockSchema`).
Assessments attach to lessons/courses; credentials certify completion;
reusable blocks live in the library with usage tracking.

## Invariants

- **Immutability**: publishing creates `lesson_versions`/`course_versions`
  rows that never change; enrollments pin versions at enrollment (ADR-017).
- **Validation-first**: a block that fails its schema cannot be saved or
  published; the learner renderer is the single shared renderer.
- **Audience gating**: journeys carry `audience_key`; enrollment refuses
  mismatches (`audience_mismatch`) — see the BFH audience-model docs.
- **Graph truth**: prerequisites form a validated DAG (cycle detection in
  both the path builder and Nova).
- Quality is coached, not enforced: Knowledge Health (lib/lesson-health.ts)
  scores real signals; publishing remains the author's decision.

As-built: learning-content-model.md, versioning-and-publishing.md,
prerequisites-and-unlocks.md, reusable-content-library.md.
