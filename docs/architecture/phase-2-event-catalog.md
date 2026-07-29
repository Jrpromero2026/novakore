# Phase 2 Event Catalog

18 new registered event types (24 → 42 total). Type list is code:
`EVENT_TYPES` in `packages/domain/src/learning.ts` (the envelope rejects
unregistered types). Base catalog:
[../domain/event-catalog.md](../domain/event-catalog.md).

## New types

| Type                              | Emitted by                    | Notes                       |
| --------------------------------- | ----------------------------- | --------------------------- |
| `studio.session.opened`           | `emit_studio_event`           | one per Studio page mount   |
| `content.learning_path.created`   | `emit_studio_event`           | path authoring              |
| `content.path_node.added`         | `emit_studio_event`           | node added to a path        |
| `content.lesson.previewed`        | `emit_studio_event`           | bounded preview signal      |
| `content.source_document.created` | `emit_studio_event`           | AI source added             |
| `library.block.created`           | `emit_studio_event`           | reusable block saved        |
| `library.block.used`              | `emit_studio_event`           | linked/copied into a lesson |
| `media.asset.uploaded`            | `emit_studio_event`           | lesson media upload         |
| `review.request.created`          | `request_review`              | review requested            |
| `review.request.decided`          | `decide_review`               | approve/changes/close       |
| `review.comment.created`          | (reserved)                    | comment stream              |
| `ai.generation.requested`         | `reserve_ai_generation`       | budget reserved             |
| `ai.generation.completed`         | `settle_ai_generation`        | validated + costed          |
| `ai.generation.failed`            | `settle_ai_generation`        | provider/validation failure |
| `ai.generation.accepted`          | `resolve_ai_generation`       | applied as draft            |
| `ai.generation.rejected`          | `resolve_ai_generation`       | discarded                   |
| `webhook.delivery.succeeded`      | `app.settle_webhook_delivery` | delivered                   |
| `webhook.delivery.failed`         | `app.settle_webhook_delivery` | dead-lettered               |

## Rules (unchanged)

- All server-authoritative, emitted via `app.emit_event` in the causing
  transaction; taxonomy `<domain>.<subject>.<verb-past>` (CHECK-enforced).
- `emit_studio_event` is an allowlist RPC — it refuses any type not in
  the app-emittable set and requires org membership (studio telemetry can
  never forge learning/assessment/credential events).
- Studio telemetry is bounded (one per mount / discrete action), never
  per-keystroke.
- The outbox worker consumes these (and all prior events) for webhook
  delivery; consumers dedupe on the analytics event id.
