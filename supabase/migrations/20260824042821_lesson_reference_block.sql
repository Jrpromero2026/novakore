-- =============================================================================
-- LESSON REFERENCE BLOCK
-- A content block that deep-links to another lesson (optionally in another
-- course on the same enrollment). Serves recall-style cross-references without
-- duplicating upstream content: downstream material recalls a concept in a
-- sentence and links to the canonical upstream lesson.
-- Domain schema: packages/domain/src/content-blocks.ts (lesson_reference v1).
-- =============================================================================

alter table public.content_blocks drop constraint content_blocks_block_type_check;
alter table public.content_blocks
  add constraint content_blocks_block_type_check
  check (block_type in (
    'rich_text','heading','callout','divider','image','video','file_link',
    'checklist','assessment_reference',
    'quote','accordion','tabs','timeline','comparison','flashcards',
    'knowledge_check','reflection','action_step','scenario','audio','pdf',
    'survey','branching_scenario','decision_tree','ai_conversation',
    'ai_roleplay','manager_approval','instructor_feedback','live_session',
    'diagram',
    'lesson_reference'
  ));
