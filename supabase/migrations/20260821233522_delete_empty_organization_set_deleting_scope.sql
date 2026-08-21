-- Declare which organization is being removed so the audit trigger skips the
-- cascade. Without it every tenant deletion failed on the first cascaded row,
-- because the audit entry referenced the organization being deleted.
--
-- This is the final definition of delete_empty_organization; it supersedes
-- 20260821233255 and 20260821233329.

create or replace function public.delete_empty_organization(
  p_organization_id uuid,
  p_confirm boolean default false,
  p_min_age_days integer default 30
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_org record;
  v_content jsonb;
  v_members integer;
  v_age_days numeric;
  v_blockers text[] := '{}';
begin
  if not app.is_platform_admin() then
    raise exception 'permission denied: platform administrators only'
      using errcode = '42501';
  end if;

  select id, name, slug, status, created_at into v_org
  from public.organizations where id = p_organization_id;
  if v_org.id is null then
    raise exception 'organization not found' using errcode = 'P0002';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('source', source, 'rows', rows)), '[]'::jsonb)
    into v_content
  from app.organization_content(p_organization_id);

  select count(*) into v_members
  from public.organization_memberships
  where organization_id = p_organization_id and status = 'active';

  v_age_days := extract(epoch from (now() - v_org.created_at)) / 86400.0;

  if jsonb_array_length(v_content) > 0 then
    v_blockers := array_append(v_blockers, 'has content');
  end if;
  -- More than one active member means people were invited and accepted, which
  -- is a workspace someone set up rather than one nobody returned to.
  if v_members > 1 then
    v_blockers := array_append(v_blockers, format('has %s active members', v_members));
  end if;
  if v_age_days < p_min_age_days then
    v_blockers := array_append(v_blockers, format('only %s days old', round(v_age_days, 1)));
  end if;

  if array_length(v_blockers, 1) is null and p_confirm then
    -- Written BEFORE the delete, at platform level (organization_id null), so
    -- it survives the cascade that removes everything scoped to this tenant.
    insert into public.audit_logs
      (organization_id, actor_user_id, action, target_type, target_id, metadata)
    values (
      null, (select auth.uid()), 'platform.organization_deleted',
      'organization', p_organization_id::text,
      jsonb_build_object(
        'slug', v_org.slug, 'name', v_org.name, 'status', v_org.status,
        'created_at', v_org.created_at, 'age_days', round(v_age_days, 1),
        'active_members', v_members
      )
    );

    -- Two declarations, both transaction-local: system roles refuse deletion
    -- without the first, and the audit trigger would fail on the foreign key
    -- for every cascaded row without the second.
    perform pg_catalog.set_config('app.system_role_maintenance', 'true', true);
    perform pg_catalog.set_config('app.deleting_organization', p_organization_id::text, true);

    delete from public.organizations where id = p_organization_id;

    perform pg_catalog.set_config('app.system_role_maintenance', 'false', true);
    perform pg_catalog.set_config('app.deleting_organization', '', true);

    return jsonb_build_object(
      'deleted', true, 'slug', v_org.slug, 'name', v_org.name,
      'age_days', round(v_age_days, 1), 'active_members', v_members
    );
  end if;

  -- Dry run is the DEFAULT. Deleting a tenant is not something to do by
  -- forgetting a parameter.
  return jsonb_build_object(
    'deleted', false,
    'would_delete', array_length(v_blockers, 1) is null,
    'slug', v_org.slug,
    'name', v_org.name,
    'age_days', round(v_age_days, 1),
    'active_members', v_members,
    'content', v_content,
    'blockers', to_jsonb(v_blockers)
  );
end;
$function$;

comment on function public.delete_empty_organization(uuid, boolean, integer) is
  'Delete an organization that was never used. Platform administrators only. Dry run unless p_confirm is true; refuses if any content exists, more than one active member, or younger than p_min_age_days.';
