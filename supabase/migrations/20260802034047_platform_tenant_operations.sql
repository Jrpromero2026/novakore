-- Platform tenant operations (Phase 6, Priority 8 — operator tooling).
-- Mirrored from remote migration 20260802034047 (applied via MCP first).
-- All three functions are PLATFORM-ADMIN ONLY (app.is_platform_admin());
-- organization members, including owners, cannot call them for other
-- effects than RLS already grants. Every action is written to audit_logs.

-- Provision a complete, empty organization: org + settings + branding +
-- the nine system roles. Idempotent on slug (returns the existing org).
create or replace function public.provision_organization(
  p_name text,
  p_slug text
) returns jsonb
language plpgsql
security definer
set search_path = public, app, extensions
as $$
declare
  v_org uuid;
begin
  if not app.is_platform_admin() then
    return jsonb_build_object('status', 'forbidden');
  end if;
  if p_name is null or length(trim(p_name)) < 2
     or p_slug !~ '^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$' then
    return jsonb_build_object('status', 'invalid');
  end if;

  select id into v_org from public.organizations where slug = p_slug;
  if v_org is not null then
    return jsonb_build_object('status', 'exists', 'organization_id', v_org);
  end if;

  insert into public.organizations (name, slug, status)
  values (trim(p_name), p_slug, 'active')
  returning id into v_org;
  insert into public.organization_settings (organization_id) values (v_org);
  insert into public.organization_branding (organization_id) values (v_org);
  perform app.create_system_roles(v_org);

  insert into public.audit_logs (organization_id, actor_user_id, action, subject_type, subject_id, detail)
  values (v_org, auth.uid(), 'platform.organization.provisioned', 'organization', v_org,
          jsonb_build_object('name', trim(p_name), 'slug', p_slug));

  return jsonb_build_object('status', 'created', 'organization_id', v_org);
end;
$$;

-- Suspend / reactivate a tenant. Suspension is reversible and blocks
-- nothing at the database level beyond what RLS already ties to
-- organization status; the app treats non-active orgs as read-limited.
create or replace function public.set_organization_status(
  p_organization_id uuid,
  p_status text
) returns jsonb
language plpgsql
security definer
set search_path = public, app, extensions
as $$
begin
  if not app.is_platform_admin() then
    return jsonb_build_object('status', 'forbidden');
  end if;
  if p_status not in ('active', 'suspended') then
    -- 'archived' (destructive intent) is deliberately NOT reachable here;
    -- archive requires a separate, acknowledged runbook step.
    return jsonb_build_object('status', 'invalid');
  end if;

  update public.organizations set status = p_status
  where id = p_organization_id;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  insert into public.audit_logs (organization_id, actor_user_id, action, subject_type, subject_id, detail)
  values (p_organization_id, auth.uid(), 'platform.organization.status_changed',
          'organization', p_organization_id, jsonb_build_object('status', p_status));

  return jsonb_build_object('status', 'ok', 'new_status', p_status);
end;
$$;

-- Read-only tenant diagnostics: counts an operator needs before touching a
-- tenant. No member PII beyond aggregate counts.
create or replace function public.tenant_diagnostics(
  p_organization_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, app, extensions
as $$
declare
  v jsonb;
begin
  if not app.is_platform_admin() then
    return jsonb_build_object('status', 'forbidden');
  end if;

  select jsonb_build_object(
    'status', 'ok',
    'organization', jsonb_build_object('id', o.id, 'slug', o.slug, 'name', o.name,
                                       'org_status', o.status, 'created_at', o.created_at),
    'members_active', (select count(*) from public.organization_memberships m
                       where m.organization_id = o.id and m.status = 'active'),
    'members_invited', (select count(*) from public.organization_memberships m
                        where m.organization_id = o.id and m.status = 'invited'),
    'courses', (select count(*) from public.courses c where c.organization_id = o.id),
    'published_courses', (select count(*) from public.courses c
                          where c.organization_id = o.id
                            and c.current_published_version_id is not null),
    'lessons', (select count(*) from public.lessons l where l.organization_id = o.id),
    'paths', (select count(*) from public.learning_paths p where p.organization_id = o.id),
    'enrollments', (select count(*) from public.enrollments e where e.organization_id = o.id),
    'events_30d', (select count(*) from public.analytics_events e
                   where e.organization_id = o.id
                     and e.occurred_at >= now() - interval '30 days'),
    'media_assets', (select count(*) from public.media_assets a where a.organization_id = o.id),
    'branding_published', (select b.theme_published is not null
                           from public.organization_branding b
                           where b.organization_id = o.id)
  ) into v
  from public.organizations o where o.id = p_organization_id;

  return coalesce(v, jsonb_build_object('status', 'not_found'));
end;
$$;

revoke all on function public.provision_organization(text, text) from public, anon;
revoke all on function public.set_organization_status(uuid, text) from public, anon;
revoke all on function public.tenant_diagnostics(uuid) from public, anon;
grant execute on function public.provision_organization(text, text) to authenticated;
grant execute on function public.set_organization_status(uuid, text) to authenticated;
grant execute on function public.tenant_diagnostics(uuid) to authenticated;
