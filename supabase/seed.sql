-- NovaKore development seed — DEVELOPMENT DATA ONLY.
-- Deterministic fixed UUIDs; idempotent (safe under repeated `db reset` and
-- tolerant of re-application). Contains no real personal data and no
-- production credentials. All seeded accounts share the documented dev-only
-- password (see docs/development/supabase.md#seeded-accounts).

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Auth users (email/password, pre-confirmed for stable QA)
-- ---------------------------------------------------------------------------
do $$
declare
  v_password text := 'NovaKore-dev-password-1';
  u record;
begin
  for u in
    select * from (values
      ('00000000-0000-4000-8000-000000000001'::uuid, 'platform.admin@novakore.test'),
      ('00000000-0000-4000-8000-000000000011'::uuid, 'alpha.owner@novakore.test'),
      ('00000000-0000-4000-8000-000000000012'::uuid, 'alpha.admin@novakore.test'),
      ('00000000-0000-4000-8000-000000000013'::uuid, 'alpha.academy@novakore.test'),
      ('00000000-0000-4000-8000-000000000014'::uuid, 'alpha.reviewer@novakore.test'),
      ('00000000-0000-4000-8000-000000000015'::uuid, 'alpha.author@novakore.test'),
      ('00000000-0000-4000-8000-000000000016'::uuid, 'alpha.learner@novakore.test'),
      ('00000000-0000-4000-8000-000000000017'::uuid, 'alpha.suspended@novakore.test'),
      ('00000000-0000-4000-8000-000000000018'::uuid, 'alpha.removed@novakore.test'),
      ('00000000-0000-4000-8000-000000000021'::uuid, 'bfh.owner@novakore.test'),
      ('00000000-0000-4000-8000-000000000022'::uuid, 'bfh.instructor@novakore.test'),
      ('00000000-0000-4000-8000-000000000023'::uuid, 'bfh.observer@novakore.test')
    ) as seed_users(id, email)
  loop
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at,
      -- GoTrue scans these as non-null strings; NULL values break sign-in
      -- with "Database error querying schema".
      confirmation_token, recovery_token, email_change,
      email_change_token_new, email_change_token_current,
      phone_change, phone_change_token, reauthentication_token
    ) values (
      '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated',
      u.email, extensions.crypt(v_password, extensions.gen_salt('bf')),
      now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
      now(), now(),
      '', '', '', '', '', '', '', ''
    )
    on conflict (id) do nothing;

    insert into auth.identities (
      id, user_id, provider_id, provider, identity_data,
      last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(), u.id, u.id::text, 'email',
      jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
      now(), now(), now()
    )
    on conflict (provider_id, provider) do nothing;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Platform administrator
-- ---------------------------------------------------------------------------
insert into public.platform_administrators (id, user_id, status)
values ('00000000-0000-4000-8000-000000000901', '00000000-0000-4000-8000-000000000001', 'active')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Organizations (+ settings, branding, system roles)
-- ---------------------------------------------------------------------------
insert into public.organizations (id, name, slug, status) values
  ('00000000-0000-4000-8000-000000000101', 'Alpha Learning Collective', 'alpha-learning', 'active'),
  ('00000000-0000-4000-8000-000000000102', 'Built For Her (Dev Tenant)', 'bfh-dev', 'active')
on conflict (id) do nothing;

insert into public.organization_settings (organization_id) values
  ('00000000-0000-4000-8000-000000000101'),
  ('00000000-0000-4000-8000-000000000102')
on conflict (organization_id) do nothing;

insert into public.organization_branding
  (organization_id, display_name, accent_light, accent_dark, font_family, radius_scale)
values
  ('00000000-0000-4000-8000-000000000101', 'Alpha Learning', '#6d28d9', '#a78bfa', 'system', 'medium'),
  ('00000000-0000-4000-8000-000000000102', 'Built For Her Academy (Dev)', '#be185d', '#f472b6', 'system', 'large')
on conflict (organization_id) do nothing;

do $$
begin
  if not exists (select 1 from public.organization_roles
                 where organization_id = '00000000-0000-4000-8000-000000000101') then
    perform app.create_system_roles('00000000-0000-4000-8000-000000000101');
  end if;
  if not exists (select 1 from public.organization_roles
                 where organization_id = '00000000-0000-4000-8000-000000000102') then
    perform app.create_system_roles('00000000-0000-4000-8000-000000000102');
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Academies
-- ---------------------------------------------------------------------------
insert into public.academies (id, organization_id, name, slug, description, status) values
  ('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000101',
   'Foundations Academy', 'foundations', 'Core onboarding and foundational programs.', 'active'),
  ('00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-000000000102',
   'Coaching Academy', 'coaching', 'Development-tenant academy for coach education.', 'active')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Memberships
-- ---------------------------------------------------------------------------
insert into public.organization_memberships (id, organization_id, user_id, status, accepted_at) values
  -- Alpha Learning Collective
  ('00000000-0000-4000-8000-000000000301', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000011', 'active', now()),
  ('00000000-0000-4000-8000-000000000302', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000012', 'active', now()),
  ('00000000-0000-4000-8000-000000000303', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000013', 'active', now()),
  ('00000000-0000-4000-8000-000000000304', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000014', 'active', now()),
  ('00000000-0000-4000-8000-000000000305', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000015', 'active', now()),
  ('00000000-0000-4000-8000-000000000306', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000016', 'active', now()),
  ('00000000-0000-4000-8000-000000000307', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000017', 'suspended', now()),
  ('00000000-0000-4000-8000-000000000308', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000018', 'removed', now()),
  -- Built For Her (Dev Tenant)
  ('00000000-0000-4000-8000-000000000311', '00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000021', 'active', now()),
  ('00000000-0000-4000-8000-000000000312', '00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000022', 'active', now()),
  ('00000000-0000-4000-8000-000000000313', '00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000023', 'active', now()),
  -- Multi-org user: alpha.author is a learner in the BFH dev tenant
  ('00000000-0000-4000-8000-000000000314', '00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000015', 'active', now())
on conflict (id) do nothing;

-- An open invitation (no auth user yet) for invite-flow QA
insert into public.organization_memberships (id, organization_id, invited_email, status, invited_at)
values ('00000000-0000-4000-8000-000000000309', '00000000-0000-4000-8000-000000000101',
        'alpha.invited@novakore.test', 'invited', now())
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Role assignments (system roles looked up by org + key)
-- ---------------------------------------------------------------------------
insert into public.organization_member_roles (id, organization_id, membership_id, role_id, academy_id)
select v.id, v.org_id, v.membership_id, r.id, v.academy_id
from (values
  -- Alpha
  ('00000000-0000-4000-8000-000000000401'::uuid, '00000000-0000-4000-8000-000000000101'::uuid, '00000000-0000-4000-8000-000000000301'::uuid, 'organization_owner', null::uuid),
  ('00000000-0000-4000-8000-000000000402'::uuid, '00000000-0000-4000-8000-000000000101'::uuid, '00000000-0000-4000-8000-000000000302'::uuid, 'organization_admin', null::uuid),
  ('00000000-0000-4000-8000-000000000403'::uuid, '00000000-0000-4000-8000-000000000101'::uuid, '00000000-0000-4000-8000-000000000303'::uuid, 'academy_admin', '00000000-0000-4000-8000-000000000201'::uuid),
  ('00000000-0000-4000-8000-000000000404'::uuid, '00000000-0000-4000-8000-000000000101'::uuid, '00000000-0000-4000-8000-000000000304'::uuid, 'reviewer', null::uuid),
  ('00000000-0000-4000-8000-000000000405'::uuid, '00000000-0000-4000-8000-000000000101'::uuid, '00000000-0000-4000-8000-000000000305'::uuid, 'author', null::uuid),
  ('00000000-0000-4000-8000-000000000406'::uuid, '00000000-0000-4000-8000-000000000101'::uuid, '00000000-0000-4000-8000-000000000306'::uuid, 'learner', null::uuid),
  ('00000000-0000-4000-8000-000000000407'::uuid, '00000000-0000-4000-8000-000000000101'::uuid, '00000000-0000-4000-8000-000000000307'::uuid, 'learner', null::uuid),
  -- BFH dev tenant
  ('00000000-0000-4000-8000-000000000411'::uuid, '00000000-0000-4000-8000-000000000102'::uuid, '00000000-0000-4000-8000-000000000311'::uuid, 'organization_owner', null::uuid),
  ('00000000-0000-4000-8000-000000000412'::uuid, '00000000-0000-4000-8000-000000000102'::uuid, '00000000-0000-4000-8000-000000000312'::uuid, 'instructor', null::uuid),
  ('00000000-0000-4000-8000-000000000413'::uuid, '00000000-0000-4000-8000-000000000102'::uuid, '00000000-0000-4000-8000-000000000313'::uuid, 'observer', null::uuid),
  ('00000000-0000-4000-8000-000000000414'::uuid, '00000000-0000-4000-8000-000000000102'::uuid, '00000000-0000-4000-8000-000000000314'::uuid, 'learner', null::uuid)
) as v(id, org_id, membership_id, role_key, academy_id)
join public.organization_roles r
  on r.organization_id = v.org_id and r.key = v.role_key and r.is_system
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Terminology — BFH-style preset. DEVELOPMENT TENANT CONFIGURATION DATA:
-- this is tenant data proving the terminology overlay (ADR-003), not
-- platform vocabulary. Canonical keys remain unchanged everywhere.
-- ---------------------------------------------------------------------------
insert into public.organization_terminology (organization_id, term_key, singular, plural, short_form) values
  ('00000000-0000-4000-8000-000000000102', 'instructor',    'Coach',      'Coaches',     'Coach'),
  ('00000000-0000-4000-8000-000000000102', 'learner',       'Member',     'Members',     null),
  ('00000000-0000-4000-8000-000000000102', 'learning_path', 'Journey',    'Journeys',    null),
  ('00000000-0000-4000-8000-000000000102', 'module',        'Phase',      'Phases',      null),
  ('00000000-0000-4000-8000-000000000102', 'course',        'Program',    'Programs',    null),
  ('00000000-0000-4000-8000-000000000102', 'assessment',    'Evaluation', 'Evaluations', null),
  ('00000000-0000-4000-8000-000000000102', 'certificate',   'Credential', 'Credentials', null)
on conflict (organization_id, term_key) do nothing;
