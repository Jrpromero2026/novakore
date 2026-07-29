# AI-Assisted Authoring (Phase 2, as built)

NovaKore's first governed AI creation workspace — ADR-010 realized for
authoring, with budget (ADR-024), provider selection (ADR-022), and the
draft-only lifecycle (ADR-023).

## 1. Hard rules (enforced, not aspirational)

- Generated content is ALWAYS draft. Nothing in the AI path can reach
  `publish_*`, permission grants, credential issuance, or learner
  progress.
- Structured outputs validate through registered Zod schemas; invalid
  output is discarded and never inserted.
- Only tenant-owned source excerpts are sent to a provider — never other
  organizations' content, never unrelated tenant data.
- Provider keys are server-only; the browser never sees them.

## 2. Operations (15)

path_outline, course_outline, module_suggestions, lesson_draft,
rewrite_audience, rewrite_reading_level, summarize_source,
knowledge_checks, assessment_questions, scenario,
prerequisite_suggestions, gap_analysis, reflection_prompts, flashcards,
source_to_blocks. Each has a registered output schema
(`AI_OUTPUT_SCHEMAS`); `lesson_draft`/`source_to_blocks` produce REAL
`contentBlockSchema` blocks.

## 3. Lifecycle

```
reserve (SQL budget hard-stop)
   → provider.generate (server, timeout, cancellation-ready)
   → validateAiOutput (registry; discard on failure)
   → settle (cost reconciliation, ai.generation.completed/failed)
   → accept | reject (ai.generation.accepted/rejected)
```

- **reserve_ai_generation** — requires `ai.author.use`; verifies every
  source belongs to the org; advisory-locks the org; enforces the budget
  (ADR-024); records the ledger row.
- **provider call** — the selected adapter (ADR-022). Errors normalize to
  stable retryable kinds.
- **validation** — invalid output settles the generation as failed
  (reservation released, cost 0).
- **accept** — inserts REAL validated DRAFT content: a draft lesson +
  blocks (lesson_draft/source_to_blocks), appended blocks (knowledge
  checks, flashcards, scenario, reflections), or a draft course tree
  (course_outline). Advisory operations (outlines, suggestions, rewrites,
  summaries, gap analyses) record acceptance; the author applies the text
  (documented limitation).

## 4. Providers (ADR-022)

`NOVAKORE_AI_PROVIDER` selects `mock` (default fixtures), `deterministic`
(fixtures + forced failure/invalid hooks for tests), or `anthropic`
(live; needs `ANTHROPIC_API_KEY`). No credentials exist in dev, so the
Anthropic adapter is UNVERIFIED against the live API — the abstraction,
workflow, budget, and UI are proven with mock/deterministic. Activation:
set both env vars server-side (never committed, never `NEXT_PUBLIC_`).

## 5. Workspace UI

Operation picker → objective/audience/reading-level → source selection
(with an explicit no-source warning: "the model will draft from general
knowledge") → generate → validated preview in history → accept-into-draft
(with a target picker) or reject / regenerate. A budget meter shows
used/reserved/remaining for the UTC month.

## 6. Source documents

`source_documents`: tenant-owned text/markdown (inline) or file (bucket)
with SHA-256 `content_hash`, review state, and provenance. Files store
but do NOT auto-extract in this phase — the UI says so plainly; grounded
generation needs pasted text or markdown. See
[source-document-model.md](source-document-model.md).
