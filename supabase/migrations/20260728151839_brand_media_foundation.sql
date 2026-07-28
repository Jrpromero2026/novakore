-- NovaKore Phase 1B — brand theme workflow + media asset foundation
-- (ADR-015 media storage, docs/brand/tenant-theming.md draft/publish model)

-- ---------------------------------------------------------------------------
-- 1. Permission: publishing an organization theme is a distinct act from
--    editing drafts (governance requirement). Everything else reuses the
--    existing org.branding.manage.
-- ---------------------------------------------------------------------------
insert into public.permissions (code, description, category) values
  ('org.branding.publish', 'Publish or revert the organization theme', 'organization')
on conflict (code) do nothing;

do $$
begin
  perform pg_catalog.set_config('app.system_role_maintenance', 'true', true);
  insert into public.organization_role_permissions (organization_id, role_id, permission_code)
  select r.organization_id, r.id, 'org.branding.publish'
  from public.organization_roles r
  where r.is_system and r.key in ('organization_owner', 'organization_admin')
  on conflict (role_id, permission_code) do nothing;
end;
$$;

-- Future organizations: owner/admin bundles include the new permission.
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
        array['org.manage','org.members.manage','org.roles.manage','org.branding.manage','org.branding.publish','org.terminology.manage','academy.manage','content.view_draft','content.author','content.publish','content.archive','paths.manage','assessment.author','assessment.grade','enrollment.manage','enrollment.self','progress.view.own','progress.view.others','certificates.manage','analytics.view','audit.view','integrations.manage','ai.author.use']),
      ('organization_admin', 'Organization Admin',
        'Administers the organization on the owner''s behalf.',
        array['org.manage','org.members.manage','org.roles.manage','org.branding.manage','org.branding.publish','org.terminology.manage','academy.manage','content.view_draft','content.author','content.publish','content.archive','paths.manage','assessment.author','assessment.grade','enrollment.manage','enrollment.self','progress.view.own','progress.view.others','certificates.manage','analytics.view','audit.view','integrations.manage','ai.author.use']),
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

-- ---------------------------------------------------------------------------
-- 2. Versioned theme draft/publish columns on organization_branding.
--    Legacy accent columns remain as the pre-theme fallback.
-- ---------------------------------------------------------------------------
alter table public.organization_branding
  add column if not exists theme_draft jsonb
    check (theme_draft is null or jsonb_typeof(theme_draft) = 'object'),
  add column if not exists theme_published jsonb
    check (theme_published is null or jsonb_typeof(theme_published) = 'object'),
  add column if not exists theme_schema_version integer not null default 1,
  add column if not exists draft_updated_at timestamptz,
  add column if not exists draft_updated_by uuid,
  add column if not exists published_at timestamptz,
  add column if not exists published_by uuid;

-- ---------------------------------------------------------------------------
-- 3. media_assets — metadata of record (ADR-015)
-- ---------------------------------------------------------------------------
create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete cascade,
  academy_id uuid,
  owner_user_id uuid,
  asset_kind text not null check (asset_kind in (
    'logo_horizontal', 'logo_horizontal_inverse', 'monogram', 'favicon',
    'app_icon', 'email_logo', 'content_image'
  )),
  storage_bucket text not null check (storage_bucket in ('org-branding', 'platform-branding')),
  storage_path text not null unique check (char_length(storage_path) <= 500),
  original_filename text not null check (char_length(original_filename) between 1 and 200),
  mime_type text not null check (mime_type in (
    'image/svg+xml', 'image/png', 'image/webp', 'image/jpeg',
    'image/x-icon', 'image/vnd.microsoft.icon'
  )),
  byte_size bigint not null check (byte_size > 0 and byte_size <= 8388608),
  width integer check (width is null or (width > 0 and width <= 6000)),
  height integer check (height is null or (height > 0 and height <= 6000)),
  alt_text text check (alt_text is null or char_length(alt_text) <= 300),
  status text not null default 'pending'
    check (status in ('pending', 'active', 'replaced', 'archived', 'failed')),
  checksum text check (checksum is null or checksum ~ '^[0-9a-f]{64}$'),
  replaced_by_asset_id uuid references public.media_assets (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  archived_at timestamptz,
  -- metadata can never reference another tenant's object path
  check (
    organization_id is null
    or storage_path like 'organizations/' || organization_id::text || '/%'
  ),
  -- platform-owned assets live only in the platform bucket, and vice versa
  check ((organization_id is null) = (storage_bucket = 'platform-branding')),
  foreign key (academy_id, organization_id)
    references public.academies (id, organization_id) on delete cascade
);

-- exactly one ACTIVE asset per (organization, slot)
create unique index media_assets_active_per_slot
  on public.media_assets (organization_id, asset_kind)
  where status = 'active' and organization_id is not null;

create index media_assets_org_idx
  on public.media_assets (organization_id, asset_kind, status);

comment on table public.media_assets is
  'Metadata of record for stored binaries (ADR-015). Replacement retains history; storage RLS and this table''s RLS must agree.';

revoke all on public.media_assets from anon;

create trigger set_updated_at before update on public.media_assets
  for each row execute function app.set_updated_at();
create trigger audit_change after insert or update on public.media_assets
  for each row execute function app.audit_change('media_asset');

alter table public.media_assets enable row level security;

create policy media_assets_select on public.media_assets
  for select to authenticated
  using (
    (organization_id is not null and app.is_org_member(organization_id))
    or (organization_id is null and app.is_platform_admin())
  );

create policy media_assets_insert on public.media_assets
  for insert to authenticated
  with check (
    organization_id is not null
    and app.has_org_permission(organization_id, 'org.branding.manage')
  );

create policy media_assets_update on public.media_assets
  for update to authenticated
  using (
    organization_id is not null
    and app.has_org_permission(organization_id, 'org.branding.manage')
  )
  with check (
    organization_id is not null
    and app.has_org_permission(organization_id, 'org.branding.manage')
  );

-- No DELETE policy: lifecycle states preserve history; cleanup is a
-- documented platform operation.

-- ---------------------------------------------------------------------------
-- 4. Storage buckets (private) + path-scoped object policies
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('org-branding', 'org-branding', false, 8388608,
   array['image/svg+xml','image/png','image/webp','image/x-icon','image/vnd.microsoft.icon']),
  ('platform-branding', 'platform-branding', false, 8388608,
   array['image/svg+xml','image/png','image/webp','image/x-icon','image/vnd.microsoft.icon'])
on conflict (id) do nothing;

-- Strict path → organization extraction; null (deny) on any malformed path.
create or replace function app.storage_path_org_id(p_name text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when p_name ~ '^organizations/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/branding/'
      then split_part(p_name, '/', 2)::uuid
  end;
$$;

revoke all on function app.storage_path_org_id(text) from public, anon;
grant execute on function app.storage_path_org_id(text) to authenticated;

-- Members may read their organization's brand objects (signed-URL creation
-- requires SELECT); only branding managers may write into their org's path.
create policy org_branding_objects_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'org-branding'
    and app.is_org_member(app.storage_path_org_id(name))
  );

create policy org_branding_objects_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'org-branding'
    and app.has_org_permission(app.storage_path_org_id(name), 'org.branding.manage')
  );

-- No UPDATE/DELETE object policies: uploads are immutable per asset id;
-- replacement writes a new path. platform-branding has NO tenant policies —
-- tenants can neither read nor write platform assets.
