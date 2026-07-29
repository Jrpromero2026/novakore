# Content Blocks

The Phase 1C block set: finite types, versioned Zod schemas, and one safe
renderer (ADR-008). Source of truth:
`packages/domain/src/content-blocks.ts`; renderer:
`apps/web/src/components/learning/block-renderer.tsx`.

## 1. Registry

Every block is `{ id, type, schemaVersion, data, position }` — UUID
identity stable across edits and versions, fractional-index position
(ADR-014), and `data` validated by the `(type, schemaVersion)` registry.
`validateBlockData` is called on every draft save and re-run before
publish; unknown `(type, version)` pairs are rejected, never stored.

| Type                   | Current v | Data (essentials)                                                                                        |
| ---------------------- | --------- | -------------------------------------------------------------------------------------------------------- |
| `rich_text`            | 1         | `text` — bounded safe text, ≤ 20 000 chars                                                               |
| `heading`              | 1         | `text` (≤ 200), `level` 2\|3 (h1 is the lesson title)                                                    |
| `callout`              | 2         | `tone` info/success/warning/danger/note, optional `title`, `body`                                        |
| `divider`              | 1         | `{}`                                                                                                     |
| `image`                | 1         | `assetId` (governed media ref — never a raw URL), `alt` required unless `decorative`, optional `caption` |
| `video`                | 1         | https `url`, `title`, optional `durationMinutes`, `transcriptNote`                                       |
| `file_link`            | 1         | `label` + exactly one of `assetId` \| https `url`                                                        |
| `checklist`            | 1         | 1–30 items `{ id, text ≤ 300 }`                                                                          |
| `assessment_reference` | 1         | `assessmentId`, `title` (engine lands in 1D)                                                             |

External URLs must parse as `https:`. Media flows through `media_assets`
references (ADR-015), not embedded URLs.

## 2. Safe text — the no-HTML contract

`rich_text`, `callout.body`, and checklist items store **plain text**
with a minimal inline subset: `**bold**`, `*italic*`,
`[label](https://…)`. The renderer parses this subset **after** React
escaping — text reaches the DOM only as text nodes; there is no
`dangerouslySetInnerHTML` anywhere in the codebase. Consequences, proven
by tests:

- `<script>`, `<img onerror>`, or any HTML in stored text renders as
  inert visible text, never as markup.
- `javascript:` links never become anchors (only `https://` matches the
  link pattern); rendered links get `rel="noreferrer noopener"`.
- Videos render as external-resource cards — no arbitrary iframes;
  provider embeds are a later, allowlisted capability.

## 3. Evolution

Schema changes are additive `schemaVersion` bumps with a registered pure
migration (`migrateBlockData` steps drafts up lazily on edit). Published
snapshots are never rewritten — renderers keep support for historical
versions forever. Reference migration: `callout` v1 → v2 (adds optional
title, widens tones). Unknown future block types degrade at render to a
neutral "not supported yet" notice instead of crashing
(`parseFrozenBlocks` additionally drops invalid snapshot entries —
documented fallback).

## 4. Phase 2 block set + classification

The registry grew to 30 types. Each carries a `BLOCK_STATUS`
classification (single source for docs, editors, and tests):

- **Implemented** (typed editor + safe renderer): rich_text, heading,
  callout, divider, file_link, checklist, assessment_reference, quote,
  accordion, tabs, timeline, comparison, flashcards, reflection,
  action_step, scenario.
- **Implemented with documented limitations**: image / audio / pdf
  (governed media via signed URLs; upload UI is Studio-side; video is an
  external card, no embeds; knowledge_check ships its answer in the
  snapshot BY DESIGN — an ungraded self-check; graded checks use
  assessment_reference).
- **Schema-only (deferred)**: survey, branching_scenario, decision_tree,
  ai_conversation, ai_roleplay, manager_approval, instructor_feedback,
  live_session, diagram. These validate and store but have no editor;
  the renderer degrades them to a neutral notice. They ship with an
  editor + renderer in a later phase.
- **Rejected from Phase 2**: none outright — `embed`/`external_tool` were
  folded into the schema-only/deferred set rather than rendering untrusted
  third-party frames (security).

## 5. Adding a block type (deliberate friction)

Schema (+ registry entry + `CURRENT_SCHEMA_VERSION` + `BLOCK_STATUS`) →
database CHECK list (`content_blocks.block_type`) → editor fields →
renderer case → tests (validation + renderer safety). All of these or it
does not ship.
