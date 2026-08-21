-- Organizations could only be created by a platform administrator, which
-- meant every new tenant required someone at a SQL console and no customer
-- ever walked the path a customer actually walks. This opens the front door:
-- a person signs up, says what they are here for, and their organization
-- exists.
--
-- provision_organization stays exactly as it was — platform-gated, for
-- operator use. This is a separate entry point with different rules: it can
-- only ever create an organization owned by the CALLER, so it grants no
-- authority over anyone else's tenant.

alter table public.organizations
  add column if not exists use_case text,
  add column if not exists use_case_detail text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'organizations_use_case_check'
  ) then
    alter table public.organizations
      add constraint organizations_use_case_check check (
        use_case is null or use_case in (
          'certification', 'corporate_training', 'coaching',
          'education', 'association', 'other'
        )
      );
  end if;
end $$;

comment on column public.organizations.use_case is
  'What the organization said it came here to do, captured at signup. Segmentation signal only — it grants and restricts nothing.';

-- A URL derived from a name the person actually typed, rather than a second
-- field they have to think about. Anything outside the slug charset collapses
-- to a single hyphen; the result is trimmed to the length the check allows.
-- (Superseded immediately below by 20260821043116, which fixes the order of
-- truncation and trimming.)
create or replace function app.slugify(p_text text)
returns text
language sql
immutable
set search_path to ''
as $$
  select
    left(
      trim(both '-' from
        regexp_replace(
          regexp_replace(lower(coalesce(p_text, '')), '[^a-z0-9]+', '-', 'g'),
          '-+', '-', 'g'
        )
      ),
      63
    )
$$;

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

  -- Open signup is not the same as unlimited signup. This stops one script
  -- from filling the tenant table without putting a human in anyone's way:
  -- a real founder creating a handful of organizations never notices it.
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
  -- A name of only punctuation slugifies to nothing, and a slug must start
  -- with an alphanumeric, so fall back rather than emit an invalid one.
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

  select id into v_owner_role_id
  from public.organization_roles
  where organization_id = v_org_id and key = 'organization_owner';

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

comment on function public.create_own_organization(text, text, text) is
  'Self-serve organization signup. Creates an organization owned by the calling user; cannot create one for anybody else. Rate limited per user.';
