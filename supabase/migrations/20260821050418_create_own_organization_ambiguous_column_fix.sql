-- `returns table (organization_id uuid, ...)` puts organization_id in scope as
-- an OUT parameter for the whole body, so the unqualified reference in the
-- role lookup was ambiguous against the column of the same name and every
-- call failed with 42702. Qualifying the column resolves it without changing
-- the returned shape, which callers and the generated types depend on.

create or replace function public.create_own_organization(
  p_name text,
  p_use_case text default null,
  p_use_case_detail text default null
)
returns table (organization_id uuid, slug text)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_base text;
  v_slug text;
  v_suffix integer := 1;
  v_org_id uuid;
  v_membership_id uuid;
  v_owner_role_id uuid;
  v_allowed boolean;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select allowed into v_allowed
  from app.consume_rate_limit('org_create:' || v_user_id::text, 5, 3600);
  if not v_allowed then
    raise exception 'too many organizations created recently; try again later'
      using errcode = '53400';
  end if;

  if p_name is null or char_length(btrim(p_name)) < 2 then
    raise exception 'organization name must be at least 2 characters'
      using errcode = '22000';
  end if;

  v_base := app.slugify(p_name);
  if v_base = '' then
    v_base := 'org';
  end if;

  v_slug := v_base;
  while exists (select 1 from public.organizations o where o.slug = v_slug) loop
    v_suffix := v_suffix + 1;
    v_slug := left(v_base, 58) || '-' || v_suffix::text;
  end loop;

  insert into public.organizations (name, slug, use_case, use_case_detail)
  values (btrim(p_name), v_slug, p_use_case, nullif(btrim(coalesce(p_use_case_detail, '')), ''))
  returning id into v_org_id;

  insert into public.organization_settings (organization_id) values (v_org_id);
  insert into public.organization_branding (organization_id) values (v_org_id);

  perform app.create_system_roles(v_org_id);

  select r.id into v_owner_role_id
  from public.organization_roles r
  where r.organization_id = v_org_id and r.key = 'organization_owner';

  -- The caller, and only ever the caller. There is no parameter for whose
  -- organization this is, so this function cannot be pointed at anyone else.
  insert into public.organization_memberships
    (organization_id, user_id, status, accepted_at, created_by)
  values (v_org_id, v_user_id, 'active', now(), v_user_id)
  returning id into v_membership_id;

  insert into public.organization_member_roles
    (organization_id, membership_id, role_id, created_by)
  values (v_org_id, v_membership_id, v_owner_role_id, v_user_id);

  return query select v_org_id, v_slug;
end;
$function$;
