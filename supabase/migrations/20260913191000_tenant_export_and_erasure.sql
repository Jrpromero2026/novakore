-- Tenant data portability and erasure (CTO review: "export and deletion do
-- not [exist] — both are contractual requirements for any enterprise
-- customer"). delete_empty_organization remains the never-used-workspace
-- cleanup; these two are the deliberate operator paths for REAL tenants.
--
-- Export discovers the tenant's tables at runtime, the same way
-- delete_empty_organization discovers content: a hand-written table list
-- would silently stop exporting the next table added, and an incomplete
-- portability export is a compliance failure that LOOKS like success.
-- Secret material never leaves the database: organization_api_keys rows are
-- exported without key_hash. Members' emails are included via auth.users —
-- an export that cannot identify its data subjects fails its purpose.
--
-- Erasure is shaped like a ceremony because it deserves one:
--   * platform administrators only;
--   * the organization must already be SUSPENDED (contain first, erase
--     second — the runbook's incident order, and it guarantees no learner
--     is mid-lesson while their tenant disappears);
--   * dry run unless the caller retypes the organization's slug;
--   * issued credentials carry public verification URLs that erasure
--     breaks; the caller must acknowledge the exact count being broken.
-- The delete itself rides the organizations FK cascade inside one
-- transaction, with the same two transaction-local declarations
-- delete_empty_organization established — plus one new sanction:
-- app.protect_immutable now lets cascaded DELETEs through for exactly the
-- organization named in app.deleting_organization. Immutability guarantees
-- content history to a tenant that exists; it was never a promise that a
-- tenant cannot exercise its right to erasure.
--
-- NOT erased: members' auth.users accounts (an identity can belong to
-- several organizations; user-level erasure is a separate, person-scoped
-- act) and the platform-level audit entry recording that the erasure
-- happened — which is itself a compliance requirement.

-- ---------------------------------------------------------------------------
-- protect_immutable: unchanged behaviour except during a sanctioned erasure.
-- ---------------------------------------------------------------------------
create or replace function app.protect_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE'
     and coalesce(nullif(current_setting('app.deleting_organization', true), ''), null)
         = old.organization_id::text
  then
    return old;
  end if;
  raise exception 'published versions are immutable (%: %)', tg_table_name, tg_op
    using errcode = '42501';
end;
$$;

comment on function app.protect_immutable() is
  'Refuses UPDATE/DELETE on immutable evidence tables. Sole exception: cascaded DELETEs for the organization named by the transaction-local app.deleting_organization setting (full tenant erasure).';

-- ---------------------------------------------------------------------------
-- Portability export.
-- ---------------------------------------------------------------------------
create or replace function public.export_organization_data(
  p_organization_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_org record;
  r record;
  v_rows jsonb;
  v_tables jsonb := '{}'::jsonb;
  v_members jsonb;
begin
  if not app.is_platform_admin() then
    raise exception 'permission denied: platform administrators only'
      using errcode = '42501';
  end if;

  select * into v_org from public.organizations where id = p_organization_id;
  if v_org.id is null then
    raise exception 'organization not found' using errcode = 'P0002';
  end if;

  for r in
    select c.table_schema as s, c.table_name as t
    from information_schema.columns c
    join information_schema.tables ti
      on ti.table_schema = c.table_schema
     and ti.table_name = c.table_name
     and ti.table_type = 'BASE TABLE'
    where c.column_name = 'organization_id'
      and c.table_schema in ('public', 'app')
      and c.table_name <> 'organizations'
    order by c.table_schema, c.table_name
  loop
    execute format(
      'select coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb)
         from %I.%I x where x.organization_id = $1',
      r.s, r.t
    ) into v_rows using p_organization_id;

    -- Key hashes are secret material; the export carries the key's
    -- metadata (name, prefix, scopes, status) and nothing verifiable.
    if r.s = 'app' and r.t = 'organization_api_keys' then
      select coalesce(jsonb_agg(e - 'key_hash'), '[]'::jsonb)
        into v_rows
      from jsonb_array_elements(v_rows) as e;
    end if;

    if jsonb_array_length(v_rows) > 0 then
      v_tables := v_tables || jsonb_build_object(r.s || '.' || r.t, v_rows);
    end if;
  end loop;

  -- Data subjects, identifiable: membership rows alone carry only user ids.
  select coalesce(jsonb_agg(jsonb_build_object(
           'membership_id', m.id,
           'membership_status', m.status,
           'user_id', u.id,
           'email', coalesce(u.email, m.invited_email)
         )), '[]'::jsonb)
    into v_members
  from public.organization_memberships m
  left join auth.users u on u.id = m.user_id
  where m.organization_id = p_organization_id;

  insert into public.audit_logs
    (organization_id, actor_user_id, action, target_type, target_id, metadata)
  values (
    p_organization_id, (select auth.uid()), 'platform.organization_exported',
    'organization', p_organization_id::text,
    jsonb_build_object('slug', v_org.slug)
  );

  return jsonb_build_object(
    'exported_at', now(),
    'organization', to_jsonb(v_org),
    'members', v_members,
    'tables', v_tables
  );
end;
$function$;

comment on function public.export_organization_data(uuid) is
  'Full tenant data export (GDPR/CCPA portability). Platform administrators only; audited. Tables discovered at runtime; api-key hashes redacted.';

-- ---------------------------------------------------------------------------
-- Erasure.
-- ---------------------------------------------------------------------------
create or replace function public.delete_organization_data(
  p_organization_id uuid,
  p_confirm_slug text default null,
  p_acknowledge_broken_credentials integer default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_org record;
  v_content jsonb;
  v_credentials integer;
  v_members integer;
  v_blockers text[] := '{}';
  r record;
  v_deleted integer;
  v_progress boolean;
  v_blocked integer;
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

  select count(*) into v_credentials
  from public.issued_credentials where organization_id = p_organization_id;

  select count(*) into v_members
  from public.organization_memberships
  where organization_id = p_organization_id and status = 'active';

  if v_org.status <> 'suspended' then
    v_blockers := array_append(v_blockers,
      'organization is not suspended — contain first (set_organization_status), then erase');
  end if;
  if p_confirm_slug is distinct from v_org.slug then
    v_blockers := array_append(v_blockers,
      'pass p_confirm_slug with the organization''s exact slug to confirm');
  end if;
  if v_credentials > 0
     and p_acknowledge_broken_credentials is distinct from v_credentials then
    v_blockers := array_append(v_blockers, format(
      '%s issued credentials have public verification URLs that erasure breaks; pass p_acknowledge_broken_credentials => %s to accept that',
      v_credentials, v_credentials));
  end if;

  if array_length(v_blockers, 1) is null then
    -- Platform-level (organization_id null) so the record survives the
    -- cascade. The erasure of a tenant is itself a fact worth auditing.
    insert into public.audit_logs
      (organization_id, actor_user_id, action, target_type, target_id, metadata)
    values (
      null, (select auth.uid()), 'platform.organization_erased',
      'organization', p_organization_id::text,
      jsonb_build_object(
        'slug', v_org.slug, 'name', v_org.name,
        'created_at', v_org.created_at,
        'active_members', v_members,
        'credentials_broken', v_credentials,
        'content', v_content
      )
    );

    perform pg_catalog.set_config('app.system_role_maintenance', 'true', true);
    perform pg_catalog.set_config('app.deleting_organization', p_organization_id::text, true);

    -- The organizations cascade alone cannot empty a USED tenant: evidence
    -- tables deliberately do not cascade from their parents (deleting a
    -- lesson never took its published versions with it). And the version
    -- back-pointers make courses↔course_versions (and the lesson and
    -- assessment pairs) cyclic, so null those first to give the sweep a
    -- leaf to start from.
    update public.courses set current_published_version_id = null
      where organization_id = p_organization_id;
    update public.lessons set current_published_version_id = null
      where organization_id = p_organization_id;
    update public.assessments set current_published_version_id = null
      where organization_id = p_organization_id;

    -- Leaf-first sweep over every org-scoped table, discovered at runtime
    -- like everything else here: a delete blocked by a foreign key is
    -- retried on the next pass, after its referrers are gone. No progress
    -- across a full pass while tables remain blocked = a real cycle, which
    -- deserves an exception, not silence.
    loop
      v_progress := false;
      v_blocked := 0;
      for r in
        select c.table_schema as s, c.table_name as t
        from information_schema.columns c
        join information_schema.tables ti
          on ti.table_schema = c.table_schema
         and ti.table_name = c.table_name
         and ti.table_type = 'BASE TABLE'
        where c.column_name = 'organization_id'
          and c.table_schema in ('public', 'app')
          and c.table_name <> 'organizations'
      loop
        begin
          execute format(
            'delete from %I.%I where organization_id = $1', r.s, r.t
          ) using p_organization_id;
          get diagnostics v_deleted = row_count;
          if v_deleted > 0 then
            v_progress := true;
          end if;
        exception when foreign_key_violation then
          v_blocked := v_blocked + 1;
        end;
      end loop;
      exit when v_blocked = 0;
      if not v_progress then
        raise exception
          'tenant erasure stalled: % tables still blocked by foreign keys',
          v_blocked;
      end if;
    end loop;

    delete from public.organizations where id = p_organization_id;

    perform pg_catalog.set_config('app.system_role_maintenance', 'false', true);
    perform pg_catalog.set_config('app.deleting_organization', '', true);

    return jsonb_build_object(
      'erased', true, 'slug', v_org.slug, 'name', v_org.name,
      'active_members', v_members, 'credentials_broken', v_credentials
    );
  end if;

  -- Dry run is the DEFAULT; the blockers say exactly what consent is missing.
  return jsonb_build_object(
    'erased', false,
    'slug', v_org.slug,
    'name', v_org.name,
    'status', v_org.status,
    'active_members', v_members,
    'credentials', v_credentials,
    'content', v_content,
    'blockers', to_jsonb(v_blockers)
  );
end;
$function$;

comment on function public.delete_organization_data(uuid, text, integer) is
  'Full tenant erasure (GDPR/CCPA). Platform administrators only. Requires the organization to be suspended, the slug retyped, and any broken public credentials acknowledged by exact count. Dry run otherwise; audited at platform scope.';
