-- NovaKore Phase 1A — foundation tables
-- Governing spec: docs/architecture (commit 3fb6e37) + owner Phase 1A decisions.
-- Naming note: owner's Phase 1A instruction names four tables differently from
-- the entity-model draft (platform_administrators, organization_role_permissions,
-- organization_member_roles, organization_terminology). The owner instruction is
-- authoritative; entity-model.md carries a reconciliation note.

-- ---------------------------------------------------------------------------
-- Schemas
-- ---------------------------------------------------------------------------
create schema if not exists app;

comment on schema app is
  'NovaKore internal helpers: authorization functions, triggers, platform data. Never exposed via PostgREST.';

-- Internal schema is callable in policies/triggers but not part of the API.
grant usage on schema app to authenticated;
revoke all on schema app from anon;

-- ---------------------------------------------------------------------------
-- organizations
-- ---------------------------------------------------------------------------
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  slug text not null unique
    check (slug ~ '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$' and slug !~ '--'),
  status text not null default 'active'
    check (status in ('active', 'suspended', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.organizations is 'Tenant root. The isolation boundary for all NovaKore data.';
comment on column public.organizations.slug is 'Globally unique, lowercase, URL-safe, immutable except via app-controlled change function.';

-- ---------------------------------------------------------------------------
-- platform_administrators (NovaKore staff — deliberately NOT org members)
-- ---------------------------------------------------------------------------
create table public.platform_administrators (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'revoked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id)
);

-- ---------------------------------------------------------------------------
-- organization_memberships
-- ---------------------------------------------------------------------------
create table public.organization_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid references auth.users (id) on delete cascade,
  invited_email text
    check (invited_email is null or invited_email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  status text not null default 'invited'
    check (status in ('invited', 'active', 'suspended', 'removed')),
  invited_at timestamptz,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  -- a non-invited membership must be bound to a real user
  check (user_id is not null or status = 'invited'),
  -- every membership identifies someone
  check (user_id is not null or invited_email is not null),
  -- composite target for same-org foreign keys
  unique (id, organization_id)
);

-- one live membership per user per org ('removed' rows are history)
create unique index organization_memberships_one_live_per_user
  on public.organization_memberships (organization_id, user_id)
  where user_id is not null and status <> 'removed';

-- one open invitation per email per org
create unique index organization_memberships_one_open_invite_per_email
  on public.organization_memberships (organization_id, lower(invited_email))
  where status = 'invited';

create index organization_memberships_user_idx
  on public.organization_memberships (user_id, status);
create index organization_memberships_org_idx
  on public.organization_memberships (organization_id, status);

-- ---------------------------------------------------------------------------
-- permissions (platform-owned finite catalog; tenants cannot mint permissions)
-- ---------------------------------------------------------------------------
create table public.permissions (
  code text primary key check (code ~ '^[a-z_]+(\.[a-z_]+){1,2}$'),
  description text not null,
  category text not null,
  created_at timestamptz not null default now()
);

comment on table public.permissions is 'Platform-defined permission catalog. Additive-only; modified exclusively by migrations.';

-- ---------------------------------------------------------------------------
-- organization_roles (system-seeded + tenant-custom permission bundles)
-- ---------------------------------------------------------------------------
create table public.organization_roles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  key text not null check (key ~ '^[a-z][a-z0-9_]{1,47}$'),
  name text not null check (char_length(name) between 2 and 60),
  description text check (description is null or char_length(description) <= 500),
  is_system boolean not null default false,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  unique (organization_id, key),
  unique (id, organization_id)
);

create index organization_roles_org_idx on public.organization_roles (organization_id, status);

-- ---------------------------------------------------------------------------
-- organization_role_permissions
-- ---------------------------------------------------------------------------
create table public.organization_role_permissions (
  organization_id uuid not null,
  role_id uuid not null,
  permission_code text not null references public.permissions (code),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  primary key (role_id, permission_code),
  foreign key (role_id, organization_id)
    references public.organization_roles (id, organization_id) on delete cascade
);

create index organization_role_permissions_org_idx
  on public.organization_role_permissions (organization_id);

-- ---------------------------------------------------------------------------
-- academies
-- ---------------------------------------------------------------------------
create table public.academies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 120),
  slug text not null
    check (slug ~ '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$' and slug !~ '--'),
  description text check (description is null or char_length(description) <= 2000),
  status text not null default 'active' check (status in ('draft', 'active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  unique (organization_id, slug),
  unique (id, organization_id)
);

create index academies_org_idx on public.academies (organization_id, status);

-- ---------------------------------------------------------------------------
-- organization_member_roles (membership × role, optional academy scope)
-- ---------------------------------------------------------------------------
create table public.organization_member_roles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  membership_id uuid not null,
  role_id uuid not null,
  academy_id uuid,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  -- same-org integrity enforced declaratively via composite FKs
  foreign key (membership_id, organization_id)
    references public.organization_memberships (id, organization_id) on delete cascade,
  foreign key (role_id, organization_id)
    references public.organization_roles (id, organization_id) on delete cascade,
  foreign key (academy_id, organization_id)
    references public.academies (id, organization_id) on delete cascade
);

create unique index organization_member_roles_unique_org_wide
  on public.organization_member_roles (membership_id, role_id)
  where academy_id is null;
create unique index organization_member_roles_unique_academy
  on public.organization_member_roles (membership_id, role_id, academy_id)
  where academy_id is not null;
create index organization_member_roles_membership_idx
  on public.organization_member_roles (membership_id);
create index organization_member_roles_org_idx
  on public.organization_member_roles (organization_id);

-- ---------------------------------------------------------------------------
-- organization_settings (single row per org; typed keys validated app-side)
-- ---------------------------------------------------------------------------
create table public.organization_settings (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  default_locale text not null default 'en'
    check (default_locale ~ '^[a-z]{2}(-[A-Z]{2})?$'),
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- organization_branding (validated tokens only — no arbitrary CSS)
-- ---------------------------------------------------------------------------
create table public.organization_branding (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  display_name text check (display_name is null or char_length(display_name) between 2 and 120),
  logo_path text check (logo_path is null or char_length(logo_path) <= 500),
  accent_light text not null default '#4f46e5' check (accent_light ~* '^#[0-9a-f]{6}$'),
  accent_dark text not null default '#818cf8' check (accent_dark ~* '^#[0-9a-f]{6}$'),
  secondary_accent_light text check (secondary_accent_light is null or secondary_accent_light ~* '^#[0-9a-f]{6}$'),
  secondary_accent_dark text check (secondary_accent_dark is null or secondary_accent_dark ~* '^#[0-9a-f]{6}$'),
  font_family text not null default 'system' check (font_family in ('system', 'geist', 'serif')),
  radius_scale text not null default 'medium' check (radius_scale in ('small', 'medium', 'large')),
  updated_at timestamptz not null default now()
);

comment on table public.organization_branding is
  'Tenant theme tokens. Hex + enum validation is the CSS-injection boundary: raw values never reach stylesheets.';

-- ---------------------------------------------------------------------------
-- organization_terminology (canonical keys, display overrides — ADR-003)
-- ---------------------------------------------------------------------------
create table public.organization_terminology (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  term_key text not null check (term_key in (
    'organization', 'academy', 'learning_system', 'learning_path', 'course',
    'module', 'lesson', 'content_block', 'assessment', 'competency',
    'certificate', 'credential', 'enrollment', 'cohort', 'instructor',
    'learner', 'author', 'reviewer', 'manager', 'observer'
  )),
  singular text not null check (char_length(singular) between 1 and 40),
  plural text not null check (char_length(plural) between 1 and 40),
  short_form text check (short_form is null or char_length(short_form) between 1 and 20),
  updated_at timestamptz not null default now(),
  primary key (organization_id, term_key)
);

-- ---------------------------------------------------------------------------
-- audit_logs (append-only)
-- ---------------------------------------------------------------------------
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete cascade,
  actor_user_id uuid,
  action text not null check (action ~ '^[a-z_]+\.[a-z_]+$'),
  target_type text not null,
  target_id text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  correlation_id text check (correlation_id is null or char_length(correlation_id) <= 128),
  created_at timestamptz not null default now()
);

create index audit_logs_org_time_idx on public.audit_logs (organization_id, created_at desc);
create index audit_logs_action_idx on public.audit_logs (organization_id, action, created_at desc);

comment on table public.audit_logs is
  'Append-only. Written exclusively by security-definer triggers/functions; tenants can never insert, update, or delete directly.';

-- ---------------------------------------------------------------------------
-- Reserved slugs (platform data, internal schema)
-- ---------------------------------------------------------------------------
create table app.reserved_slugs (slug text primary key);

insert into app.reserved_slugs (slug) values
  ('admin'), ('api'), ('app'), ('auth'), ('callback'), ('dashboard'),
  ('docs'), ('help'), ('internal'), ('invite'), ('login'), ('logout'),
  ('mail'), ('novakore'), ('platform'), ('public'), ('root'), ('select-org'),
  ('settings'), ('sign-in'), ('sign-out'), ('sign-up'), ('signin'),
  ('signout'), ('signup'), ('static'), ('studio'), ('supabase'), ('support'),
  ('system'), ('www');

-- ---------------------------------------------------------------------------
-- Shared triggers
-- ---------------------------------------------------------------------------
create or replace function app.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger set_updated_at before update on public.organizations
  for each row execute function app.set_updated_at();
create trigger set_updated_at before update on public.platform_administrators
  for each row execute function app.set_updated_at();
create trigger set_updated_at before update on public.organization_memberships
  for each row execute function app.set_updated_at();
create trigger set_updated_at before update on public.organization_roles
  for each row execute function app.set_updated_at();
create trigger set_updated_at before update on public.organization_settings
  for each row execute function app.set_updated_at();
create trigger set_updated_at before update on public.organization_branding
  for each row execute function app.set_updated_at();
create trigger set_updated_at before update on public.organization_terminology
  for each row execute function app.set_updated_at();
create trigger set_updated_at before update on public.academies
  for each row execute function app.set_updated_at();

-- Reserved-slug protection for organizations and academies.
-- SECURITY DEFINER is required: the trigger runs as the inserting user, and
-- app.reserved_slugs is RLS-locked (no policies) — an invoker-rights check
-- would silently see zero rows and let reserved slugs through.
create or replace function app.enforce_reserved_slug()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from app.reserved_slugs r where r.slug = new.slug) then
    raise exception 'slug "%" is reserved', new.slug using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger enforce_reserved_slug before insert or update of slug on public.organizations
  for each row execute function app.enforce_reserved_slug();
create trigger enforce_reserved_slug before insert or update of slug on public.academies
  for each row execute function app.enforce_reserved_slug();

-- Organization slugs are immutable except via the controlled change function,
-- which sets a transaction-local authorization flag before updating.
create or replace function app.protect_organization_slug()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.slug is distinct from old.slug
     and coalesce(current_setting('app.slug_change_authorized', true), '') <> 'true' then
    raise exception 'organization slug is immutable; use the controlled slug-change operation'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger protect_organization_slug before update on public.organizations
  for each row execute function app.protect_organization_slug();

-- Membership lifecycle: only approved transitions.
create or replace function app.enforce_membership_transitions()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = new.status then
    return new;
  end if;
  if old.status = 'removed' then
    raise exception 'removed memberships are immutable history; re-invite instead'
      using errcode = '42501';
  end if;
  if not (
    (old.status = 'invited'   and new.status in ('active', 'removed')) or
    (old.status = 'active'    and new.status in ('suspended', 'removed')) or
    (old.status = 'suspended' and new.status in ('active', 'removed'))
  ) then
    raise exception 'invalid membership transition % -> %', old.status, new.status
      using errcode = '23514';
  end if;
  if old.status = 'invited' and new.status = 'active' and new.user_id is null then
    raise exception 'cannot activate a membership without a user' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger enforce_membership_transitions before update on public.organization_memberships
  for each row execute function app.enforce_membership_transitions();

-- System roles are platform-managed: tenants cannot edit, archive, or delete
-- them, and cannot create new roles flagged as system.
create or replace function app.protect_system_roles()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.is_system and coalesce(current_setting('app.system_role_maintenance', true), '') <> 'true' then
      raise exception 'system roles cannot be deleted' using errcode = '42501';
    end if;
    return old;
  end if;
  if tg_op = 'UPDATE' and old.is_system
     and coalesce(current_setting('app.system_role_maintenance', true), '') <> 'true' then
    raise exception 'system roles are managed by the platform' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger protect_system_roles before update or delete on public.organization_roles
  for each row execute function app.protect_system_roles();

-- Permission grants on system roles are equally platform-managed.
create or replace function app.protect_system_role_permissions()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_role record;
begin
  select is_system into v_role
  from public.organization_roles
  where id = coalesce(new.role_id, old.role_id);
  if coalesce(v_role.is_system, false)
     and coalesce(current_setting('app.system_role_maintenance', true), '') <> 'true' then
    raise exception 'system role permissions are managed by the platform' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger protect_system_role_permissions
  before insert or update or delete on public.organization_role_permissions
  for each row execute function app.protect_system_role_permissions();
