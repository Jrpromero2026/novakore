# EVENT_ARCHITECTURE

Two event systems, one principle: events are immutable facts.

## Analytics log (`analytics_events`)

- Emitted in-transaction by RPCs via `app.emit_event` with idempotency keys.
- Namespaced `domain.subject.verb` types (phase-2-event-catalog.md).
- Sole source for activity UI, ops metrics, Nova learner signals, and the
  executive digest.
- Read gating: `analytics.view`; actor identity resolution additionally
  requires `org.members.manage`.

## Transactional outbox (ADR-018)

- Same-transaction projection of contract events (BFH webhooks) into the
  outbox; the `webhook-worker` Edge Function delivers with exponential
  backoff + dead-letter; pg_cron schedules it; receivers dedupe on
  `eventId`; payloads are HMAC-signed per endpoint.

## Rules

- Never fabricate events; never mutate them; new event types are additive.
- Planned weekly/rollup aggregates must derive from this log so history
  stays replayable.

As-built: analytics-and-events.md, transactional-outbox.md,
outbox-worker.md.
