-- NovaKore Phase 1A — authorization helpers, RLS policies, grants
-- Model: docs/architecture/tenancy-and-authorization.md (ADR-006).
-- RLS = coarse tenant isolation + sensitive-row restriction.
-- Server-side can() remains the authoritative business-authorization layer.

-- ---------------------------------------------------------------------------
-- Helper functions (schema app; SECURITY DEFINER with empty search_path).
-- They intentionally bypass RLS but only ever answer questions about
-- auth.uid() — the caller can never ask about another user.
-- ---------------------------------------------------------------------------

create or replace function app.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.platform_administrators pa
    where pa.user_id = (select auth.uid())
      and pa.status = 'active'
  );
$$;

create or replace function app.member_org_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.organization_id
  from public.organization_memberships m
  where m.user_id = (select auth.uid())
    and m.status = 'active';
$$;

create or replace function app.is_org_member(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_memberships m
    where m.organization_id = p_organization_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
  );
$$;

-- Org-wide permission: only assignments without an academy scope qualify.
create or replace function app.has_org_permission(p_organization_id uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_memberships m
    join public.organization_member_roles mr on mr.membership_id = m.id
    join public.organization_roles r on r.id = mr.role_id and r.status = 'active'
    join public.organization_role_permissions rp on rp.role_id = r.id
    where m.organization_id = p_organization_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and mr.academy_id is null
      and rp.permission_code = p_permission
  );
$$;

-- Academy-scoped permission: org-wide assignments OR assignments scoped to
-- the given academy qualify.
create or replace function app.has_academy_permission(
  p_organization_id uuid,
  p_permission text,
  p_academy_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_memberships m
    join public.organization_member_roles mr on mr.membership_id = m.id
    join public.organization_roles r on r.id = mr.role_id and r.status = 'active'
    join public.organization_role_permissions rp on rp.role_id = r.id
    where m.organization_id = p_organization_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and (mr.academy_id is null or mr.academy_id = p_academy_id)
      and rp.permission_code = p_permission
  );
$$;

-- Helper functions are callable by authenticated (used in policies) but are
-- not exposed over the API (schema app is not in PostgREST's schema list).
revoke all on function app.is_platform_admin() from public, anon;
revoke all on function app.member_org_ids() from public, anon;
revoke all on function app.is_org_member(uuid) from public, anon;
revoke all on function app.has_org_permission(uuid, text) from public, anon;
revoke all on function app.has_academy_permission(uuid, text, uuid) from public, anon;
grant execute on function app.is_platform_admin() to authenticated;
grant execute on function app.member_org_ids() to authenticated;
grant execute on function app.is_org_member(uuid) to authenticated;
grant execute on function app.has_org_permission(uuid, text) to authenticated;
grant execute on function app.has_academy_permission(uuid, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Grants hygiene.
-- anon gets NOTHING on tenant tables — anonymous users cannot touch tenant
-- data even before RLS is considered. authenticated loses write grants on
-- tables whose writes flow exclusively through definer functions.
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon;
revoke all on app.reserved_slugs from anon, authenticated;

revoke insert, update, delete, truncate, references, trigger on public.organizations from authenticated;
grant update (name, status) on public.organizations to authenticated; -- slug/id protected; RLS gates rows
revoke insert, update, delete on public.organization_memberships from authenticated;
revoke insert, update, delete on public.platform_administrators from authenticated;
revoke insert, update, delete on public.permissions from authenticated;
revoke insert, update, delete on public.audit_logs from authenticated;

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere (default deny).
-- ---------------------------------------------------------------------------
alter table public.organizations enable row level security;
alter table public.platform_administrators enable row level security;
alter table public.organization_memberships enable row level security;
alter table public.permissions enable row level security;
alter table public.organization_roles enable row level security;
alter table public.organization_role_permissions enable row level security;
alter table public.organization_member_roles enable row level security;
alter table public.organization_settings enable row level security;
alter table public.organization_branding enable row level security;
alter table public.organization_terminology enable row level security;
alter table public.academies enable row level security;
alter table public.audit_logs enable row level security;
alter table app.reserved_slugs enable row level security;

-- ---------------------------------------------------------------------------
-- organizations
-- ---------------------------------------------------------------------------
create policy organizations_select on public.organizations
  for select to authenticated
  using (
    id in (select app.member_org_ids())
    or app.is_platform_admin()
  );

create policy organizations_update on public.organizations
  for update to authenticated
  using (app.has_org_permission(id, 'org.manage'))
  with check (app.has_org_permission(id, 'org.manage'));

-- No INSERT/DELETE policies: provisioning happens through the platform-admin
-- definer function; organizations are never deleted through the API.

-- ---------------------------------------------------------------------------
-- platform_administrators (self-visibility + platform admins; no API writes)
-- ---------------------------------------------------------------------------
create policy platform_administrators_select on public.platform_administrators
  for select to authenticated
  using (user_id = (select auth.uid()) or app.is_platform_admin());

-- ---------------------------------------------------------------------------
-- permissions (readable catalog; writes only via migrations)
-- ---------------------------------------------------------------------------
create policy permissions_select on public.permissions
  for select to authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- organization_memberships (reads: self or member-managers; writes: functions only)
-- ---------------------------------------------------------------------------
create policy organization_memberships_select on public.organization_memberships
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or app.has_org_permission(organization_id, 'org.members.manage')
  );

-- ---------------------------------------------------------------------------
-- organization_roles
-- ---------------------------------------------------------------------------
create policy organization_roles_select on public.organization_roles
  for select to authenticated
  using (app.is_org_member(organization_id));

create policy organization_roles_insert on public.organization_roles
  for insert to authenticated
  with check (
    app.has_org_permission(organization_id, 'org.roles.manage')
    and is_system = false
  );

create policy organization_roles_update on public.organization_roles
  for update to authenticated
  using (app.has_org_permission(organization_id, 'org.roles.manage'))
  with check (
    app.has_org_permission(organization_id, 'org.roles.manage')
    and is_system = false
  );

-- No DELETE policy: roles are archived via status, never deleted by tenants.

-- ---------------------------------------------------------------------------
-- organization_role_permissions
-- ---------------------------------------------------------------------------
create policy organization_role_permissions_select on public.organization_role_permissions
  for select to authenticated
  using (app.is_org_member(organization_id));

create policy organization_role_permissions_insert on public.organization_role_permissions
  for insert to authenticated
  with check (app.has_org_permission(organization_id, 'org.roles.manage'));

create policy organization_role_permissions_delete on public.organization_role_permissions
  for delete to authenticated
  using (app.has_org_permission(organization_id, 'org.roles.manage'));

-- (System-role rows are additionally shielded by the protect trigger.)

-- ---------------------------------------------------------------------------
-- organization_member_roles
-- ---------------------------------------------------------------------------
create policy organization_member_roles_select on public.organization_member_roles
  for select to authenticated
  using (
    app.has_org_permission(organization_id, 'org.roles.manage')
    or app.has_org_permission(organization_id, 'org.members.manage')
    or exists (
      select 1 from public.organization_memberships m
      where m.id = membership_id and m.user_id = (select auth.uid())
    )
  );

create policy organization_member_roles_insert on public.organization_member_roles
  for insert to authenticated
  with check (app.has_org_permission(organization_id, 'org.roles.manage'));

create policy organization_member_roles_delete on public.organization_member_roles
  for delete to authenticated
  using (app.has_org_permission(organization_id, 'org.roles.manage'));

-- ---------------------------------------------------------------------------
-- organization_settings
-- ---------------------------------------------------------------------------
create policy organization_settings_select on public.organization_settings
  for select to authenticated
  using (app.is_org_member(organization_id));

create policy organization_settings_insert on public.organization_settings
  for insert to authenticated
  with check (app.has_org_permission(organization_id, 'org.manage'));

create policy organization_settings_update on public.organization_settings
  for update to authenticated
  using (app.has_org_permission(organization_id, 'org.manage'))
  with check (app.has_org_permission(organization_id, 'org.manage'));

-- ---------------------------------------------------------------------------
-- organization_branding
-- ---------------------------------------------------------------------------
create policy organization_branding_select on public.organization_branding
  for select to authenticated
  using (app.is_org_member(organization_id));

create policy organization_branding_insert on public.organization_branding
  for insert to authenticated
  with check (app.has_org_permission(organization_id, 'org.branding.manage'));

create policy organization_branding_update on public.organization_branding
  for update to authenticated
  using (app.has_org_permission(organization_id, 'org.branding.manage'))
  with check (app.has_org_permission(organization_id, 'org.branding.manage'));

-- ---------------------------------------------------------------------------
-- organization_terminology
-- ---------------------------------------------------------------------------
create policy organization_terminology_select on public.organization_terminology
  for select to authenticated
  using (app.is_org_member(organization_id));

create policy organization_terminology_insert on public.organization_terminology
  for insert to authenticated
  with check (app.has_org_permission(organization_id, 'org.terminology.manage'));

create policy organization_terminology_update on public.organization_terminology
  for update to authenticated
  using (app.has_org_permission(organization_id, 'org.terminology.manage'))
  with check (app.has_org_permission(organization_id, 'org.terminology.manage'));

create policy organization_terminology_delete on public.organization_terminology
  for delete to authenticated
  using (app.has_org_permission(organization_id, 'org.terminology.manage'));

-- ---------------------------------------------------------------------------
-- academies (update honors academy-scoped academy.manage assignments)
-- ---------------------------------------------------------------------------
create policy academies_select on public.academies
  for select to authenticated
  using (app.is_org_member(organization_id));

create policy academies_insert on public.academies
  for insert to authenticated
  with check (app.has_org_permission(organization_id, 'academy.manage'));

create policy academies_update on public.academies
  for update to authenticated
  using (app.has_academy_permission(organization_id, 'academy.manage', id))
  with check (app.has_academy_permission(organization_id, 'academy.manage', id));

-- No DELETE policy: academies archive via status.

-- ---------------------------------------------------------------------------
-- audit_logs (read: audit.view within org, platform admins for platform rows;
-- writes: none — definer triggers/functions only)
-- ---------------------------------------------------------------------------
create policy audit_logs_select on public.audit_logs
  for select to authenticated
  using (
    (organization_id is not null and app.has_org_permission(organization_id, 'audit.view'))
    or (organization_id is null and app.is_platform_admin())
  );

-- ---------------------------------------------------------------------------
-- Permission catalog seed (platform data — lives in migrations, not seeds)
-- ---------------------------------------------------------------------------
insert into public.permissions (code, description, category) values
  ('org.manage',             'Edit organization profile and settings; manage organization lifecycle', 'organization'),
  ('org.members.manage',     'Invite, suspend, and remove members',                                   'organization'),
  ('org.roles.manage',       'Create and edit custom roles and role assignments',                     'organization'),
  ('org.branding.manage',    'Edit organization branding and theme tokens',                           'organization'),
  ('org.terminology.manage', 'Edit organization display terminology',                                 'organization'),
  ('academy.manage',         'Create and manage academies (org-wide or scoped)',                      'academy'),
  ('content.view_draft',     'View unpublished draft content',                                        'content'),
  ('content.author',         'Create and edit draft courses, modules, lessons, and blocks',           'content'),
  ('content.publish',        'Publish and unpublish content versions',                                'content'),
  ('content.archive',        'Archive content',                                                       'content'),
  ('paths.manage',           'Author learning paths, nodes, and prerequisites',                       'paths'),
  ('assessment.author',      'Author assessments and items',                                          'assessment'),
  ('assessment.grade',       'Grade attempts and view learner responses',                             'assessment'),
  ('enrollment.manage',      'Enroll and withdraw others; manage cohorts',                            'enrollment'),
  ('enrollment.self',        'Self-enroll where targets allow it',                                    'enrollment'),
  ('progress.view.own',      'View own progress',                                                     'progress'),
  ('progress.view.others',   'View other learners'' progress within scope',                           'progress'),
  ('certificates.manage',    'Manage certificate templates, issuance, and revocation',                'credentials'),
  ('analytics.view',         'View analytics dashboards within scope',                                'analytics'),
  ('audit.view',             'Read the organization audit log',                                       'audit'),
  ('integrations.manage',    'Manage integration connections, webhooks, and API keys',                'integrations'),
  ('ai.author.use',          'Use AI authoring tools',                                                'ai');
