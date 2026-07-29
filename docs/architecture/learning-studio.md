# Learning Studio (Phase 2)

The primary authoring environment (ADR-020): a spatial, command-driven
workspace over the SAME domain model, RPCs, and RLS as all other
authoring. Nothing here is a new source of truth.

## 1. Surfaces (`/admin/studio`)

| Route                              | Purpose                                                    |
| ---------------------------------- | ---------------------------------------------------------- |
| `/studio`                          | Overview: recent drafts, review queue, AI activity, counts |
| `/studio/paths`, `/paths/[pathId]` | Path list + visual canvas builder                          |
| `/studio/library`                  | Reusable content library                                   |
| `/studio/ai`                       | Governed AI authoring workspace                            |
| `/studio/review`                   | Review requests + threaded comments                        |

Courses, lessons, and assessments open in their existing 1C/1D editors
(the Studio nav links to them); the lesson editor gained the Phase 2
block set, save-to-library, and request-review affordances.

## 2. Shell

- Access floor is `content.view_draft`; each action keeps its own
  permission (library.manage, sources.manage, ai.author.use, paths.manage,
  content.publish, …).
- Command palette foundation: Ctrl/Cmd-K opens a keyboard-navigable jump
  list over known routes (no fake search index).
- Organization + academy context and tenant terminology come from the
  existing resolvers; one bounded `studio.session.opened` event per mount.

## 3. Authority boundary

The Studio never becomes authoritative:

- The visual path canvas is presentation; `path_layouts` stores
  coordinates separately from semantic order; every canvas action mirrors
  into a keyboard-accessible ordered list that IS the editor
  ([visual-path-builder.md](visual-path-builder.md)).
- The cycle-prevention database trigger (1C) remains the authority;
  `validatePathGraph` only powers authoring feedback and a client-side
  pre-check.
- Previews render through the ONE trusted block renderer
  ([media-and-storage-as-built.md](media-and-storage-as-built.md) §preview).
- Publishing, grading, issuance, and progress are unchanged 1C/1D RPCs.

## 4. Telemetry (bounded, not per-keystroke)

`emit_studio_event` is an allowlisted RPC (studio.session.opened,
content.learning_path.created, content.path_node.added,
content.lesson.previewed, library.block.created, library.block.used,
media.asset.uploaded, content.source_document.created) — it refuses any
other type and requires org membership. Full list in
[phase-2-event-catalog.md](phase-2-event-catalog.md).

## 5. UI direction

Premium, calm, editorial: strong typography, layered surfaces, contextual
side panels over modals, tenant accent tokens, intelligent empty states,
command-driven creation, clear draft/published status. No fake analytics,
no dashboard theater, no drag-and-drop without a keyboard alternative.
