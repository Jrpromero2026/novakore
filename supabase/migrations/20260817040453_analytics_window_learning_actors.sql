-- Follow-up to 20260817040230: Nova's "quiet enrollments" signal needs the
-- DISTINCT actors who produced learning activity inside the window. A
-- day/type aggregate cannot express that, and fetching raw rows to derive it
-- would reintroduce the scan this work removes. The set is bounded by member
-- count, so returning it alongside the series keeps Nova to one round trip.
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
  v_since timestamptz := date_trunc('day', now() at time zone 'UTC')
                         - make_interval(days => v_days - 1);
begin
  if not app.has_org_permission(p_organization_id, 'analytics.view') then
    return jsonb_build_object('status', 'forbidden');
  end if;

  select jsonb_build_object(
    'status', 'ok',
    'window_days', v_days,
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
        'day', to_char(day, 'YYYY-MM-DD'), 'type', type, 'count', n))
      from (
        select date_trunc('day', e.occurred_at at time zone 'UTC')::date as day,
               e.type,
               count(*)::int as n
          from public.analytics_events e
         where e.organization_id = p_organization_id
           and e.occurred_at >= v_since
         group by 1, 2
      ) grouped), '[]'::jsonb),
    'total', coalesce((
      select count(*)::int from public.analytics_events e
       where e.organization_id = p_organization_id
         and e.occurred_at >= v_since), 0),
    'learning_actors', coalesce((
      select jsonb_agg(distinct e.actor_user_id)
        from public.analytics_events e
       where e.organization_id = p_organization_id
         and e.occurred_at >= v_since
         and e.actor_user_id is not null
         and e.type like 'learning.%'), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;
