-- NovaKore Phase 1A — audit triggers, system-role provisioning, controlled operations
-- Audit writes happen exclusively through SECURITY DEFINER trigger/functions;
-- tenants have no direct write path to audit_logs (no policies, no grants).

-- ---------------------------------------------------------------------------
-- Generic audit trigger
-- ---------------------------------------------------------------------------
create or replace function app.audit_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target_type text := tg_argv[0];
  v_action text;
  v_org_id uuid;
  v_target_id text;
  v_metadata jsonb;
  v_changed text[];
  v_before jsonb;
  v_after jsonb;
  -- status is read via jsonb because direct new.status / old.status
  -- references fail to plan on tables without a status column, even inside
  -- unmatched CASE branches.
  v_old_status text;
  v_new_status text;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    v_old_status := to_jsonb(old) ->> 'status';
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    v_new_status := to_jsonb(new) ->> 'status';
  end if;

  -- organization scope + target identity per table
  if tg_table_name = 'organizations' then
    v_org_id := coalesce(new.id, old.id);
    v_target_id := coalesce(new.id, old.id)::text;
  elsif tg_table_name = 'organization_terminology' then
    v_org_id := coalesce(new.organization_id, old.organization_id);
    v_target_id := coalesce(new.term_key, old.term_key);
  elsif tg_table_name = 'organization_role_permissions' then
    v_org_id := coalesce(new.organization_id, old.organization_id);
    v_target_id := coalesce(new.role_id, old.role_id)::text || ':' || coalesce(new.permission_code, old.permission_code);
  elsif tg_table_name in ('organization_settings', 'organization_branding') then
    v_org_id := coalesce(new.organization_id, old.organization_id);
    v_target_id := v_org_id::text;
  else
    v_org_id := coalesce(new.organization_id, old.organization_id);
    v_target_id := coalesce(new.id, old.id)::text;
  end if;

  -- semantic action
  if tg_op = 'INSERT' then
    v_action := case tg_table_name
      when 'organizations' then 'organization.created'
      when 'organization_memberships' then
        case v_new_status when 'invited' then 'membership.invited' else 'membership.created' end
      when 'organization_roles' then 'role.created'
      when 'organization_role_permissions' then 'role_permission.granted'
      when 'organization_member_roles' then 'member_role.assigned'
      when 'organization_terminology' then 'terminology.set'
      when 'organization_branding' then 'branding.updated'
      when 'organization_settings' then 'settings.updated'
      when 'academies' then 'academy.created'
      else lower(tg_table_name) || '.created'
    end;
    v_metadata := jsonb_build_object('row', to_jsonb(new) - 'updated_at');
  elsif tg_op = 'UPDATE' then
    select array_agg(d.key), jsonb_object_agg(d.key, d.old_value), jsonb_object_agg(d.key, d.new_value)
      into v_changed, v_before, v_after
      from (
        select n.key, o.value as old_value, n.value as new_value
        from jsonb_each(to_jsonb(new)) n
        join jsonb_each(to_jsonb(old)) o on o.key = n.key
        where n.value is distinct from o.value and n.key <> 'updated_at'
      ) d;

    if v_changed is null then
      return coalesce(new, old); -- updated_at-only churn: nothing material
    end if;

    v_action := case
      when tg_table_name = 'organizations' and 'slug' = any (v_changed) then 'organization.slug_changed'
      when tg_table_name = 'organizations' then 'organization.updated'
      when tg_table_name = 'organization_memberships' then
        case
          when v_old_status = 'invited' and v_new_status = 'active' then 'membership.accepted'
          when v_new_status = 'suspended' then 'membership.suspended'
          when v_new_status = 'removed' then 'membership.removed'
          when v_old_status = 'suspended' and v_new_status = 'active' then 'membership.reactivated'
          else 'membership.updated'
        end
      when tg_table_name = 'organization_roles' and v_new_status = 'archived' and v_old_status <> 'archived'
        then 'role.archived'
      when tg_table_name = 'organization_roles' then 'role.updated'
      when tg_table_name = 'organization_terminology' then 'terminology.set'
      when tg_table_name = 'organization_branding' then 'branding.updated'
      when tg_table_name = 'organization_settings' then 'settings.updated'
      when tg_table_name = 'academies' and v_new_status = 'archived' and v_old_status <> 'archived'
        then 'academy.archived'
      when tg_table_name = 'academies' then 'academy.updated'
      else lower(tg_table_name) || '.updated'
    end;
    v_metadata := jsonb_build_object('changed', to_jsonb(v_changed), 'before', v_before, 'after', v_after);
  else -- DELETE
    v_action := case tg_table_name
      when 'organization_role_permissions' then 'role_permission.revoked'
      when 'organization_member_roles' then 'member_role.revoked'
      when 'organization_terminology' then 'terminology.removed'
      else lower(tg_table_name) || '.deleted'
    end;
    v_metadata := jsonb_build_object('row', to_jsonb(old) - 'updated_at');
  end if;

  insert into public.audit_logs (organization_id, actor_user_id, action, target_type, target_id, metadata, correlation_id)
  values (
    v_org_id,
    (select auth.uid()),
    v_action,
    v_target_type,
    v_target_id,
    v_metadata,
    nullif(current_setting('app.correlation_id', true), '')
  );

  return coalesce(new, old);
end;
$$;

revoke all on function app.audit_change() from public, anon, authenticated;

create trigger audit_change after insert or update on public.organizations
  for each row execute function app.audit_change('organization');
create trigger audit_change after insert or update on public.organization_memberships
  for each row execute function app.audit_change('organization_membership');
create trigger audit_change after insert or update or delete on public.organization_roles
  for each row execute function app.audit_change('organization_role');
create trigger audit_change after insert or delete on public.organization_role_permissions
  for each row execute function app.audit_change('organization_role_permission');
create trigger audit_change after insert or delete on public.organization_member_roles
  for each row execute function app.audit_change('organization_member_role');
create trigger audit_change after insert or update or delete on public.organization_terminology
  for each row execute function app.audit_change('organization_terminology');
create trigger audit_change after insert or update on public.organization_branding
  for each row execute function app.audit_change('organization_branding');
create trigger audit_change after insert or update on public.organization_settings
  for each row execute function app.audit_change('organization_settings');
create trigger audit_change after insert or update on public.academies
  for each row execute function app.audit_change('academy');

-- ---------------------------------------------------------------------------
-- System-role template (internal): the seeded permission bundles
-- ---------------------------------------------------------------------------
create or replace function app.create_system_roles(p_organization_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role_id uuid;
  v_def record;
begin
  perform pg_catalog.set_config('app.system_role_maintenance', 'true', true);

  for v_def in
    select * from (values
      ('organization_owner', 'Organization Owner',
        'Full control of the organization.',
        array['org.manage','org.members.manage','org.roles.manage','org.branding.manage','org.terminology.manage','academy.manage','content.view_draft','content.author','content.publish','content.archive','paths.manage','assessment.author','assessment.grade','enrollment.manage','enrollment.self','progress.view.own','progress.view.others','certificates.manage','analytics.view','audit.view','integrations.manage','ai.author.use']),
      ('organization_admin', 'Organization Admin',
        'Administers the organization on the owner''s behalf.',
        array['org.manage','org.members.manage','org.roles.manage','org.branding.manage','org.terminology.manage','academy.manage','content.view_draft','content.author','content.publish','content.archive','paths.manage','assessment.author','assessment.grade','enrollment.manage','enrollment.self','progress.view.own','progress.view.others','certificates.manage','analytics.view','audit.view','integrations.manage','ai.author.use']),
      ('academy_admin', 'Academy Admin',
        'Administers assigned academies.',
        array['academy.manage','content.view_draft','content.author','content.publish','content.archive','paths.manage','assessment.author','assessment.grade','enrollment.manage','enrollment.self','progress.view.own','progress.view.others','analytics.view','ai.author.use']),
      ('author', 'Author',
        'Creates and edits draft content. Publishing requires a separate role.',
        array['content.view_draft','content.author','paths.manage','assessment.author','enrollment.self','progress.view.own','ai.author.use']),
      ('reviewer', 'Reviewer',
        'Reviews and publishes content.',
        array['content.view_draft','content.publish','assessment.grade','enrollment.self','progress.view.own']),
      ('instructor', 'Instructor',
        'Teaches and grades within scope.',
        array['content.view_draft','assessment.grade','enrollment.manage','enrollment.self','progress.view.own','progress.view.others','analytics.view']),
      ('manager', 'Manager',
        'Manages learners'' enrollment and progress visibility.',
        array['enrollment.manage','enrollment.self','progress.view.own','progress.view.others','analytics.view']),
      ('learner', 'Learner',
        'Learns.',
        array['enrollment.self','progress.view.own']),
      ('observer', 'Observer',
        'Read-only reporting within scope.',
        array['progress.view.others','analytics.view'])
    ) as defs(key, name, description, permission_codes)
  loop
    insert into public.organization_roles (organization_id, key, name, description, is_system, created_by)
    values (p_organization_id, v_def.key, v_def.name, v_def.description, true, (select auth.uid()))
    returning id into v_role_id;

    insert into public.organization_role_permissions (organization_id, role_id, permission_code, created_by)
    select p_organization_id, v_role_id, code, (select auth.uid())
    from unnest(v_def.permission_codes) as code;
  end loop;
end;
$$;

revoke all on function app.create_system_roles(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Controlled operations (public schema RPCs; SECURITY DEFINER with internal
-- authorization — deny by default, explicit checks first)
-- ---------------------------------------------------------------------------

-- Platform-admin-only: provision an organization with settings, branding,
-- system roles, and an owner membership (invited if the email has no user).
create or replace function public.provision_organization(
  p_name text,
  p_slug text,
  p_owner_email text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org_id uuid;
  v_owner_user_id uuid;
  v_membership_id uuid;
  v_owner_role_id uuid;
begin
  if not app.is_platform_admin() then
    raise exception 'permission denied: platform administrators only' using errcode = '42501';
  end if;
  if p_owner_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'invalid owner email' using errcode = '22000';
  end if;

  insert into public.organizations (name, slug)
  values (p_name, p_slug)
  returning id into v_org_id;

  insert into public.organization_settings (organization_id) values (v_org_id);
  insert into public.organization_branding (organization_id) values (v_org_id);

  perform app.create_system_roles(v_org_id);

  select id into v_owner_role_id
  from public.organization_roles
  where organization_id = v_org_id and key = 'organization_owner';

  select id into v_owner_user_id
  from auth.users
  where lower(email) = lower(p_owner_email)
  limit 1;

  if v_owner_user_id is not null then
    insert into public.organization_memberships (organization_id, user_id, status, accepted_at, created_by)
    values (v_org_id, v_owner_user_id, 'active', now(), (select auth.uid()))
    returning id into v_membership_id;
  else
    insert into public.organization_memberships (organization_id, invited_email, status, invited_at, created_by)
    values (v_org_id, lower(p_owner_email), 'invited', now(), (select auth.uid()))
    returning id into v_membership_id;
  end if;

  insert into public.organization_member_roles (organization_id, membership_id, role_id, created_by)
  values (v_org_id, v_membership_id, v_owner_role_id, (select auth.uid()));

  return v_org_id;
end;
$$;

-- Invite a member (org.members.manage).
create or replace function public.invite_member(
  p_organization_id uuid,
  p_email text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_membership_id uuid;
  v_existing_user uuid;
begin
  if not app.has_org_permission(p_organization_id, 'org.members.manage') then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  if p_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'invalid email' using errcode = '22000';
  end if;

  select id into v_existing_user from auth.users where lower(email) = lower(p_email) limit 1;

  if v_existing_user is not null and exists (
    select 1 from public.organization_memberships
    where organization_id = p_organization_id
      and user_id = v_existing_user
      and status <> 'removed'
  ) then
    raise exception 'this person already has a membership in the organization' using errcode = '23505';
  end if;

  insert into public.organization_memberships (organization_id, invited_email, status, invited_at, created_by)
  values (p_organization_id, lower(p_email), 'invited', now(), (select auth.uid()))
  returning id into v_membership_id;

  return v_membership_id;
end;
$$;

-- Accept an invitation. Binding rule (invitation-takeover defense): the
-- caller's CONFIRMED auth email must equal the invited email. The invited
-- email is never disclosed to unauthenticated parties.
create or replace function public.accept_invitation(p_organization_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_email text;
  v_confirmed timestamptz;
  v_membership_id uuid;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select lower(email), email_confirmed_at into v_email, v_confirmed
  from auth.users where id = v_user_id;

  if v_confirmed is null then
    raise exception 'email must be confirmed before accepting an invitation' using errcode = '42501';
  end if;

  select id into v_membership_id
  from public.organization_memberships
  where organization_id = p_organization_id
    and status = 'invited'
    and lower(invited_email) = v_email
  for update;

  if v_membership_id is null then
    raise exception 'no open invitation for this account' using errcode = 'P0002';
  end if;

  update public.organization_memberships
  set user_id = v_user_id, status = 'active', accepted_at = now()
  where id = v_membership_id;

  return v_membership_id;
end;
$$;

-- Suspend / reactivate / remove a membership (org.members.manage), with
-- self-action and last-owner safeguards.
create or replace function public.set_membership_status(
  p_membership_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_m record;
begin
  if p_status not in ('active', 'suspended', 'removed') then
    raise exception 'invalid target status' using errcode = '22000';
  end if;

  select * into v_m from public.organization_memberships where id = p_membership_id for update;
  if v_m.id is null then
    raise exception 'membership not found' using errcode = 'P0002';
  end if;
  if not app.has_org_permission(v_m.organization_id, 'org.members.manage') then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  if v_m.user_id = (select auth.uid()) then
    raise exception 'you cannot change your own membership status' using errcode = '42501';
  end if;

  -- last-active-owner guard
  if p_status in ('suspended', 'removed') and exists (
    select 1
    from public.organization_member_roles mr
    join public.organization_roles r on r.id = mr.role_id
    where mr.membership_id = v_m.id and r.key = 'organization_owner' and r.is_system
  ) then
    if not exists (
      select 1
      from public.organization_memberships m2
      join public.organization_member_roles mr2 on mr2.membership_id = m2.id
      join public.organization_roles r2 on r2.id = mr2.role_id
      where m2.organization_id = v_m.organization_id
        and m2.id <> v_m.id
        and m2.status = 'active'
        and r2.key = 'organization_owner' and r2.is_system
    ) then
      raise exception 'cannot suspend or remove the last active organization owner' using errcode = '23514';
    end if;
  end if;

  update public.organization_memberships
  set status = p_status
  where id = p_membership_id;
end;
$$;

-- Controlled slug change: platform administrators only (owner decision —
-- no self-service slug changes in Phase 1A).
create or replace function public.change_organization_slug(
  p_organization_id uuid,
  p_new_slug text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not app.is_platform_admin() then
    raise exception 'permission denied: platform administrators only' using errcode = '42501';
  end if;
  perform pg_catalog.set_config('app.slug_change_authorized', 'true', true);
  update public.organizations set slug = p_new_slug where id = p_organization_id;
end;
$$;

-- Execution grants: authenticated only; anon can invoke nothing.
revoke all on function public.provision_organization(text, text, text) from public, anon;
revoke all on function public.invite_member(uuid, text) from public, anon;
revoke all on function public.accept_invitation(uuid) from public, anon;
revoke all on function public.set_membership_status(uuid, text) from public, anon;
revoke all on function public.change_organization_slug(uuid, text) from public, anon;
grant execute on function public.provision_organization(text, text, text) to authenticated;
grant execute on function public.invite_member(uuid, text) to authenticated;
grant execute on function public.accept_invitation(uuid) to authenticated;
grant execute on function public.set_membership_status(uuid, text) to authenticated;
grant execute on function public.change_organization_slug(uuid, text) to authenticated;
