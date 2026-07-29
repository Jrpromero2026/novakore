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

## 4. Scheduling (LIVE — Phase 2 closeout, 2026-07-29)

The worker is scheduled via `pg_cron` + `pg_net` (the mechanism the
dashboard's Cron UI automates). Enabled by migrations
`20260729221240_enable_pg_net_for_outbox_worker` and
`20260729221909_reinstall_pg_net_in_extensions_schema` (pg_net lives in
the `extensions` schema; pg_cron was already installed).

- **Job** `novakore-webhook-worker`, schedule `*/5 * * * *` (every 5
  minutes, dev cadence), `active`.
- **Invocation** — `net.http_post` to
  `/functions/v1/webhook-worker` with the **project anon JWT** as the
  bearer. `verify_jwt` only requires a validly-signed project JWT; the
  worker's privileged DB access comes from the service-role key in its
  own function environment, so **no service-role secret lives in the cron
  command** (the anon key is public by design). The cron command is
  operational config held in `cron.job`, not a committed migration.
- **Verified (2026-07-29)** — scheduled runs `runid 1`@22:15 and
  `runid 2`@22:20 UTC both `succeeded`; the worker returned HTTP `200`
  with `{"claimed":0,...}` (0 active endpoints), and neither the response
  body nor the edge-function logs contained any secret material. The
  full delivered/retry/dead-letter state machine is proven separately by
  the domain + real-DB isolation tests.

To re-create from scratch:

```sql
select cron.schedule('novakore-webhook-worker', '*/5 * * * *', $$
  select net.http_post(
    url := 'https://<project-ref>.supabase.co/functions/v1/webhook-worker',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer <project-anon-jwt>'),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000);
$$);
```

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
