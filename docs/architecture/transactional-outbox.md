# Transactional Outbox

ADR-018 implementation: how domain events leave the system without ever
diverging from state.

## 1. The problem it solves

"Write the row, then publish the event" fails in both orders: publish
first and the transaction may roll back (phantom event); write first and
the publish may fail (lost event). Both corrupt analytics and every
future integration. The outbox pattern writes the event **into the same
database transaction** as the state change; delivery happens later by
reading the table.

## 2. app.emit_event — the only writer

```
app.emit_event(org_id, type, subject_kind, subject_id,
               context, data, idempotency_key)
```

Called exclusively by the learning RPCs (and future definer operations)
inside their transaction. It:

1. Inserts `analytics_events` (envelope v1: type taxonomy
   `<domain>.<subject>.<verb-past>` CHECK-enforced, actor from
   `auth.uid()`, optional `correlation_id` from the
   `app.correlation_id` setting).
2. On `idempotency_key` conflict, stops — a replayed logical action
   emits **nothing**, in either table.
3. Otherwise inserts one `outbox_events` row whose `payload` is the full
   envelope (JSONB), `status = 'pending'`.

EXECUTE is revoked from `public`, `anon`, and `authenticated`: clients
cannot forge events even though the function is SECURITY DEFINER.

## 3. outbox_events — platform-internal only

Columns: `event_type`, `event_version`, `organization_id`, `payload`,
`status` (`pending | processing | processed | failed | dead_letter`),
`attempt_count`, `available_at`, `processed_at`, `last_error`; claim
index on `(status, available_at)`.

RLS is enabled with **zero policies** and all grants revoked for client
roles — tenants can neither read nor write the outbox (proven by the
learning isolation suite). Only platform-internal execution (definer
functions today, the worker tomorrow) touches it.

## 4. Processing contract (worker deferred)

No worker ships in Phase 1C — nothing consumes the outbox yet, and rows
accumulate harmlessly. When fan-out is needed (webhooks in Phase 1D+,
aggregates in Phase 3), the worker MUST follow this contract:

1. **Claim:** `UPDATE ... SET status='processing' WHERE id IN (SELECT id
FROM outbox_events WHERE status='pending' AND available_at <= now()
ORDER BY created_at LIMIT n FOR UPDATE SKIP LOCKED) RETURNING *`.
2. **Deliver** to each consumer idempotently (payload carries the
   analytics event id as the dedupe key downstream).
3. **Settle:** success → `processed` + `processed_at`; failure →
   increment `attempt_count`, set `last_error`, `status='failed'`, and
   reschedule via `available_at` with exponential backoff; after a
   bounded attempt budget → `dead_letter` (operator-visible, never
   silently dropped).
4. Ordering is per-organization best-effort (created_at); consumers must
   not assume global ordering.
5. `processed` rows are prunable after a retention window; `dead_letter`
   rows are not — they represent work owed.

## 5. What this is not

Not a message bus (no consumer registry yet), not the analytics store
(that is `analytics_events`), and not a client telemetry path — client-
emitted advisory events (§4 of
[analytics-and-events.md](analytics-and-events.md)) will use a separate
validated batch endpoint and never write the outbox.
