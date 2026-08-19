-- Rate limiting (CTO review P1: "Key/HMAC auth bounds authorization, not
-- volume").
--
-- WHY THE COUNTER LIVES IN POSTGRES
-- ---------------------------------
-- The app runs on serverless instances with no shared memory. An in-process
-- limiter would give each instance its own counter, so the real ceiling
-- would be (limit x instance count) and would drift with autoscaling — that
-- is not a weak limit, it is no limit. Postgres is the one piece of shared,
-- transactional state every surface already talks to, including the Deno
-- edge functions, so the counter goes here.
--
-- WHY THIS FUNCTION IS NOT REACHABLE FROM THE CLIENT
-- --------------------------------------------------
-- The anon key is public — it ships in the browser bundle. A generic
-- `consume_rate_limit(bucket, ...)` exposed through PostgREST would itself
-- be an attack: anyone could burn another tenant's quota by naming their
-- bucket. So this lives in `app`, which PostgREST does not expose, and is
-- only ever called by SECURITY DEFINER functions that have already proven
-- who the caller is and derive the bucket themselves.

create table if not exists app.rate_limits (
  bucket       text        not null,
  window_start timestamptz not null,
  hits         integer     not null default 0,
  primary key (bucket, window_start)
);

comment on table app.rate_limits is
  'Fixed-window request counters. Rows are transient; a pg_cron job purges expired windows.';

-- Fixed window, not sliding. The trade is understood and deliberate: a
-- client can send up to 2x the limit across a window boundary. That is
-- acceptable for abuse control, and the alternative (a request log with a
-- rolling count) costs a row per request instead of a row per window.
create or replace function app.consume_rate_limit(
  p_bucket text,
  p_limit integer,
  p_window_seconds integer
)
returns table (allowed boolean, remaining integer, retry_after integer)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_window_start timestamptz;
  v_hits integer;
begin
  -- A limit of 0 or less disables the check rather than blocking everything;
  -- a misconfigured row must not take an integration offline.
  if p_limit is null or p_limit <= 0 then
    return query select true, 2147483647, 0;
    return;
  end if;

  v_window_start := to_timestamp(
    floor(extract(epoch from clock_timestamp()) / p_window_seconds)
    * p_window_seconds
  );

  -- One statement, so concurrent requests serialise on the row rather than
  -- read-modify-write racing each other.
  insert into app.rate_limits as rl (bucket, window_start, hits)
  values (p_bucket, v_window_start, 1)
  on conflict (bucket, window_start)
    do update set hits = rl.hits + 1
  returning rl.hits into v_hits;

  return query select
    v_hits <= p_limit,
    greatest(p_limit - v_hits, 0),
    case
      when v_hits <= p_limit then 0
      else greatest(
        ceil(extract(epoch from
          (v_window_start + make_interval(secs => p_window_seconds))
          - clock_timestamp()
        ))::integer, 1)
    end;
end;
$$;

comment on function app.consume_rate_limit(text, integer, integer) is
  'Atomically charge one request against a fixed window. Internal only: callers must derive the bucket from a verified identity, never from client input.';

-- Expired windows are dead weight; nothing reads them.
create or replace function app.purge_rate_limits()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  delete from app.rate_limits where window_start < now() - interval '1 hour';
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

-- Per-key ceiling, so a partner can be raised or throttled without a
-- migration. Default chosen to sit far above normal integration traffic and
-- well below what would strain the database.
alter table app.organization_api_keys
  add column if not exists rate_limit_per_minute integer not null default 120;

comment on column app.organization_api_keys.rate_limit_per_minute is
  'Requests per minute allowed for this key. 0 or less disables the limit.';

-- Nobody outside the database may touch any of this.
revoke all on table app.rate_limits from public, anon, authenticated;
revoke all on function app.consume_rate_limit(text, integer, integer)
  from public, anon, authenticated;
revoke all on function app.purge_rate_limits() from public, anon, authenticated;
