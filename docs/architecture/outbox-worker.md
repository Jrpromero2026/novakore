# Outbox Delivery Worker (Phase 2)

The scheduled Supabase Edge Function that fulfills the ADR-018 transport
contract (ADR-025), with SSRF hardening (ADR-026).

## 1. Shape

`supabase/functions/webhook-worker/index.ts` — a Deno Edge Function
deployed to novakore-dev (ACTIVE, `verify_jwt` on). It uses the
service-role key from the function environment (never client-exposed) via
public `worker_*` wrapper RPCs (service_role only), since PostgREST
exposes only the public schema.

## 2. Per-invocation loop

1. **Claim** — `app.claim_webhook_deliveries(limit)`:
   - fans pending `outbox_events` out to matching active
     `webhook_endpoints` (event-type filter; empty = all), inserting
     `webhook_deliveries` rows (`on conflict do nothing`);
   - settles outbox events with no subscribed endpoint straight to
     `processed` (nothing owes delivery);
   - claims due deliveries with `FOR UPDATE SKIP LOCKED`, flipping them to
     `delivering` and incrementing `attempt_count` — **no duplicate
     concurrent processing**.
2. **Deliver** — per claimed delivery: load endpoint + payload, run the
   SSRF check (ADR-026), sign `${timestamp}.${rawBody}` with HMAC-SHA256
   (`X-NovaKore-Signature: v1=<hex>` + `X-NovaKore-Timestamp`), POST with
   `redirect: "error"` and a 10s timeout, read at most 4KB and redact
   secrets.
3. **Settle** — `app.settle_webhook_delivery`:
   - `delivered` → status delivered + `webhook.delivery.succeeded`;
   - `retry` (429/5xx within the 6-attempt budget) → failed +
     backoff `next_attempt_at` (1m→5m→25m, cap 2h);
   - `dead_letter` (4xx or budget exhausted) → dead_letter +
     `webhook.delivery.failed`.
   - When every delivery for an outbox event is terminal, the event flips
     to `processed` (or `failed` if any dead-lettered).

## 3. Manual retry

`retry_webhook_delivery` (RPC, `integrations.manage`) resets a
failed/dead-letter delivery to pending and re-arms the outbox event.

## 4. Scheduling (owner action)

The function is deployed but NOT yet scheduled. To activate delivery,
add a cron trigger in the Supabase dashboard (e.g. every minute) or a
`pg_cron` + `net.http_post` invocation. Until then it runs only on manual
POST. Documented in the Phase 2 report's owner-actions section.

## 5. Idempotency + safety

- At-least-once delivery; consumers dedupe on the analytics event id
  carried in the payload.
- The claim is atomic; two concurrent invocations never process the same
  delivery.
- The service-role key stays in the function env; wrappers are
  service_role-only; endpoints/deliveries are `integrations.manage`-gated
  and tenant-isolated.
- Signing, SSRF policy, backoff, and redaction are pure functions shared
  with the domain tests (`packages/domain/src/webhooks.ts`).
