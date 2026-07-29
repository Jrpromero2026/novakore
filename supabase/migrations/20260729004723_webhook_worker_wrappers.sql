-- Public-schema worker wrappers for the outbox delivery Edge Function
-- (ADR-025). PostgREST only exposes the public schema, so the function
-- (service-role) calls these thin SECURITY DEFINER wrappers, which
-- delegate to the app-schema claim/settle logic. Granted to service_role
-- ONLY — never to anon or authenticated.
create or replace function public.worker_claim_webhook_deliveries(p_limit integer default 20)
returns setof public.webhook_deliveries
language sql
security definer
set search_path = ''
as $$
  select * from app.claim_webhook_deliveries(p_limit);
$$;

create or replace function public.worker_settle_webhook_delivery(
  p_delivery_id uuid,
  p_outcome text,
  p_response_status integer default null,
  p_response_excerpt text default null,
  p_error text default null,
  p_backoff_seconds integer default 60
)
returns void
language sql
security definer
set search_path = ''
as $$
  select app.settle_webhook_delivery(
    p_delivery_id, p_outcome, p_response_status,
    p_response_excerpt, p_error, p_backoff_seconds
  );
$$;

revoke all on function public.worker_claim_webhook_deliveries(integer) from public, anon, authenticated;
revoke all on function public.worker_settle_webhook_delivery(uuid, text, integer, text, text, integer) from public, anon, authenticated;
grant execute on function public.worker_claim_webhook_deliveries(integer) to service_role;
grant execute on function public.worker_settle_webhook_delivery(uuid, text, integer, text, text, integer) to service_role;
