-- Analytics rollups (CTO review P1-7). The app fetched up to 5,000 raw
-- analytics_events per render and aggregated in JavaScript. That is O(events)
-- work on every page load AND silently WRONG past the limit — the newest
-- 5,000 rows are not the whole organization. These functions aggregate in
-- Postgres over the indexed (organization_id, type) path and return a handful
-- of rows, so results are both fast and complete.
--
-- Both are analytics-gated: org-wide activity requires `analytics.view`,
-- re-checked inside the function (the database is the final authority).

-- All-time organizational metrics: type counts, distinct active learners,
-- and lesson drop-off. Optional tester-cohort filter.
create or replace function public.org_event_metrics(
  p_organization_id uuid,
  p_cohort text default null
) returns jsonb
language plpgsql
stable
security definer
set search_path = public, app, extensions
as $$
declare
  v_result jsonb;
  v_cohort_users uuid[];
begin
  if not app.has_org_permission(p_organization_id, 'analytics.view') then
    return jsonb_build_object('status', 'forbidden');
  end if;

  if p_cohort is not null then
    select array_agg(m.user_id)
      into v_cohort_users
      from public.tester_labels tl
      join public.organization_memberships m on m.id = tl.membership_id
     where tl.organization_id = p_organization_id
       and tl.label = p_cohort
       and m.user_id is not null;
  end if;

  with ev as (
    select e.type, e.subject_id, e.actor_user_id
      from public.analytics_events e
     where e.organization_id = p_organization_id
       -- A cohort with no members must match NOTHING (not everything).
       and (
         p_cohort is null
         or (v_cohort_users is not null and e.actor_user_id = any(v_cohort_users))
       )
  ),
  counts as (
    select type, count(*)::int as n from ev group by type
  ),
  gaps as (
    select subject_id,
           count(*) filter (where type = 'learning.lesson.started')::int   as started,
           count(*) filter (where type = 'learning.lesson.completed')::int as completed
      from ev
     where type in ('learning.lesson.started', 'learning.lesson.completed')
       and subject_id is not null
     group by subject_id
  ),
  top_gaps as (
    select subject_id, started, completed, started - completed as gap
      from gaps
     where started > completed
     order by started - completed desc
     limit 5
  )
  select jsonb_build_object(
    'status', 'ok',
    'counts', coalesce((select jsonb_object_agg(type, n) from counts), '{}'::jsonb),
    'active_learners', (
      select count(distinct actor_user_id)::int from ev
       where actor_user_id is not null
         and (type like 'learning.%' or type like 'enrollment.%')
    ),
    'drop_off', coalesce((
      select jsonb_agg(jsonb_build_object(
        'lesson_id', subject_id, 'started', started,
        'completed', completed, 'gap', gap))
      from top_gaps), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

-- Windowed activity, pre-grouped by day and type. One small result set feeds
-- the sparkline, the executive digest's two windows, and the weekday rhythm.
create or replace function public.org_event_daily_by_type(
  p_organization_id uuid,
  p_window_days int default 14
) returns jsonb
language plpgsql
stable
security definer
set search_path = public, app, extensions
as $$
declare
  v_result jsonb;
  v_days int := least(greatest(coalesce(p_window_days, 14), 1), 400);
begin
  if not app.has_org_permission(p_organization_id, 'analytics.view') then
    return jsonb_build_object('status', 'forbidden');
  end if;

  select jsonb_build_object(
    'status', 'ok',
    'window_days', v_days,
    'rows', coalesce(jsonb_agg(jsonb_build_object(
      'day', to_char(day, 'YYYY-MM-DD'), 'type', type, 'count', n)), '[]'::jsonb),
    'total', coalesce(sum(n)::int, 0)
  ) into v_result
  from (
    select date_trunc('day', e.occurred_at at time zone 'UTC')::date as day,
           e.type,
           count(*)::int as n
      from public.analytics_events e
     where e.organization_id = p_organization_id
       and e.occurred_at >= (date_trunc('day', now() at time zone 'UTC')
                             - make_interval(days => v_days - 1))
     group by 1, 2
  ) grouped;

  return v_result;
end;
$$;

revoke all on function public.org_event_metrics(uuid, text) from public, anon;
revoke all on function public.org_event_daily_by_type(uuid, int) from public, anon;
grant execute on function public.org_event_metrics(uuid, text) to authenticated;
grant execute on function public.org_event_daily_by_type(uuid, int) to authenticated;
