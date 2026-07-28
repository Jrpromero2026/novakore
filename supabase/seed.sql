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

-- ---------------------------------------------------------------------------
-- Phase 1B — published themes (versioned schema) for the seeded tenants,
-- and a fallback organization with deliberately incomplete branding.
-- Invalid theme values are exercised in tests only — never seeded.
-- ---------------------------------------------------------------------------
update public.organization_branding
set theme_published = '{"schemaVersion":1,"colors":{"accentLight":"#6d28d9","accentDark":"#a78bfa"},"typography":{"interfaceFont":"system"},"shape":{"radiusProfile":"balanced"},"modes":{"availability":"both","defaultMode":"system"}}'::jsonb,
    published_at = now()
where organization_id = '00000000-0000-4000-8000-000000000101'
  and theme_published is null;

update public.organization_branding
set theme_published = '{"schemaVersion":1,"colors":{"accentLight":"#be185d","accentDark":"#f472b6"},"typography":{"interfaceFont":"geist"},"shape":{"radiusProfile":"soft"},"modes":{"availability":"both","defaultMode":"system"}}'::jsonb,
    published_at = now()
where organization_id = '00000000-0000-4000-8000-000000000102'
  and theme_published is null;

-- Gamma Research Institute: fallback-behavior fixture — default branding row,
-- no published theme, no assets. Alpha's owner also owns this org.
insert into public.organizations (id, name, slug, status) values
  ('00000000-0000-4000-8000-000000000103', 'Gamma Research Institute', 'gamma-research', 'active')
on conflict (id) do nothing;

insert into public.organization_settings (organization_id)
values ('00000000-0000-4000-8000-000000000103')
on conflict (organization_id) do nothing;

insert into public.organization_branding (organization_id)
values ('00000000-0000-4000-8000-000000000103')
on conflict (organization_id) do nothing;

do $$
begin
  if not exists (select 1 from public.organization_roles
                 where organization_id = '00000000-0000-4000-8000-000000000103') then
    perform app.create_system_roles('00000000-0000-4000-8000-000000000103');
  end if;
end;
$$;

insert into public.organization_memberships (id, organization_id, user_id, status, accepted_at)
values ('00000000-0000-4000-8000-000000000315', '00000000-0000-4000-8000-000000000103',
        '00000000-0000-4000-8000-000000000011', 'active', now())
on conflict (id) do nothing;

insert into public.organization_member_roles (id, organization_id, membership_id, role_id)
select '00000000-0000-4000-8000-000000000421', '00000000-0000-4000-8000-000000000103',
       '00000000-0000-4000-8000-000000000315', r.id
from public.organization_roles r
where r.organization_id = '00000000-0000-4000-8000-000000000103'
  and r.key = 'organization_owner' and r.is_system
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Phase 1C — seeded learning data (deterministic ids, idempotent).
-- State-only fixtures: analytics/outbox events come from real operations,
-- never from seeds. published_by = alpha.reviewer (holds content.publish).
-- ---------------------------------------------------------------------------

insert into public.learning_systems (id, organization_id, academy_id, slug, title, description, status) values
  ('00000000-0000-4000-8000-000000000501', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000201',
   'professional-foundations', 'Professional Foundations',
   'Core professional development framework for the Foundations Academy.', 'active'),
  ('00000000-0000-4000-8000-000000000503', '00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000202',
   'coach-certification', 'Coach Certification',
   'Certification framework for coaches (development tenant).', 'active')
on conflict (id) do nothing;

insert into public.learning_paths (id, organization_id, academy_id, learning_system_id, slug, title, description, status) values
  ('00000000-0000-4000-8000-000000000502', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000201',
   '00000000-0000-4000-8000-000000000501', 'foundations-track', 'Foundations Track',
   'Sequenced route from first principles to advanced practice.', 'active'),
  ('00000000-0000-4000-8000-000000000504', '00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000202',
   '00000000-0000-4000-8000-000000000503', 'certification-journey', 'Certification Journey',
   'The certification journey for new coaches.', 'active')
on conflict (id) do nothing;

insert into public.courses (id, organization_id, slug, title, summary, status) values
  ('00000000-0000-4000-8000-000000000511', '00000000-0000-4000-8000-000000000101',
   'foundations-practice', 'Foundations of Practice', 'Orientation and core principles.', 'draft'),
  ('00000000-0000-4000-8000-000000000512', '00000000-0000-4000-8000-000000000101',
   'advanced-practice', 'Advanced Practice', 'Advanced methods building on the foundations.', 'draft'),
  ('00000000-0000-4000-8000-000000000513', '00000000-0000-4000-8000-000000000102',
   'bfh-foundations-program', 'Foundations Program', 'The first program in the certification journey.', 'draft')
on conflict (id) do nothing;

insert into public.modules (id, organization_id, course_id, title, position) values
  ('00000000-0000-4000-8000-000000000521', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000511', 'Getting Started', 'a0'),
  ('00000000-0000-4000-8000-000000000522', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000511', 'Core Concepts', 'a1'),
  ('00000000-0000-4000-8000-000000000523', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000512', 'Advanced Modules', 'a0'),
  ('00000000-0000-4000-8000-000000000524', '00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000513', 'Phase One', 'a0')
on conflict (id) do nothing;

insert into public.lessons (id, organization_id, course_id, module_id, title, position, required) values
  ('00000000-0000-4000-8000-000000000531', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000511', '00000000-0000-4000-8000-000000000521', 'Welcome & Orientation', 'a0', true),
  ('00000000-0000-4000-8000-000000000532', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000511', '00000000-0000-4000-8000-000000000521', 'Principles', 'a1', true),
  ('00000000-0000-4000-8000-000000000533', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000511', '00000000-0000-4000-8000-000000000522', 'Applying the Basics', 'a0', true),
  ('00000000-0000-4000-8000-000000000534', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000512', '00000000-0000-4000-8000-000000000523', 'Advanced Methods', 'a0', true),
  ('00000000-0000-4000-8000-000000000535', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000512', '00000000-0000-4000-8000-000000000523', 'Capstone Review', 'a1', true),
  ('00000000-0000-4000-8000-000000000536', '00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000513', '00000000-0000-4000-8000-000000000524', 'Movement Screening Session', 'a0', true),
  ('00000000-0000-4000-8000-000000000537', '00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000513', '00000000-0000-4000-8000-000000000524', 'Client Intake Session', 'a1', true)
on conflict (id) do nothing;

insert into public.content_blocks (id, organization_id, lesson_id, block_type, schema_version, data, position) values
  ('00000000-0000-4000-8000-000000000601', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000531', 'heading', 1, '{"text":"Welcome","level":2}', 'a0'),
  ('00000000-0000-4000-8000-000000000602', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000531', 'rich_text', 1, '{"text":"Welcome to the program. This lesson orients you to how learning works here."}', 'a1'),
  ('00000000-0000-4000-8000-000000000603', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000532', 'rich_text', 1, '{"text":"Our practice rests on a small set of durable principles you will apply everywhere."}', 'a0'),
  ('00000000-0000-4000-8000-000000000604', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000532', 'callout', 2, '{"tone":"info","body":"Take notes: the principles return in every later course."}', 'a1'),
  ('00000000-0000-4000-8000-000000000605', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000533', 'rich_text', 1, '{"text":"Time to apply the basics in a structured exercise."}', 'a0'),
  ('00000000-0000-4000-8000-000000000606', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000533', 'checklist', 1, '{"items":[{"id":"00000000-0000-4000-8000-0000000006a1","text":"Review the principles"},{"id":"00000000-0000-4000-8000-0000000006a2","text":"Complete the worksheet"}]}', 'a1'),
  ('00000000-0000-4000-8000-000000000607', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000534', 'rich_text', 1, '{"text":"Advanced methods extend the foundations with judgment under constraints."}', 'a0'),
  ('00000000-0000-4000-8000-000000000608', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000535', 'rich_text', 1, '{"text":"The capstone review consolidates everything from this track."}', 'a0'),
  ('00000000-0000-4000-8000-000000000609', '00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000536', 'rich_text', 1, '{"text":"Screen movement patterns before programming. Observe, do not correct yet."}', 'a0'),
  ('00000000-0000-4000-8000-000000000610', '00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000537', 'rich_text', 1, '{"text":"A structured intake builds trust and surfaces constraints early."}', 'a0')
on conflict (id) do nothing;

insert into public.lesson_versions (id, organization_id, lesson_id, course_id, version_number, title, required, blocks, published_by) values
  ('00000000-0000-4000-8000-000000000711', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000531', '00000000-0000-4000-8000-000000000511', 1, 'Welcome & Orientation', true,
   '[{"id":"00000000-0000-4000-8000-000000000601","type":"heading","schemaVersion":1,"data":{"text":"Welcome","level":2},"position":"a0"},{"id":"00000000-0000-4000-8000-000000000602","type":"rich_text","schemaVersion":1,"data":{"text":"Welcome to the program. This lesson orients you to how learning works here."},"position":"a1"}]',
   '00000000-0000-4000-8000-000000000014'),
  ('00000000-0000-4000-8000-000000000712', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000532', '00000000-0000-4000-8000-000000000511', 1, 'Principles', true,
   '[{"id":"00000000-0000-4000-8000-000000000603","type":"rich_text","schemaVersion":1,"data":{"text":"Our practice rests on a small set of durable principles you will apply everywhere."},"position":"a0"},{"id":"00000000-0000-4000-8000-000000000604","type":"callout","schemaVersion":2,"data":{"tone":"info","body":"Take notes: the principles return in every later course."},"position":"a1"}]',
   '00000000-0000-4000-8000-000000000014'),
  ('00000000-0000-4000-8000-000000000713', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000533', '00000000-0000-4000-8000-000000000511', 1, 'Applying the Basics', true,
   '[{"id":"00000000-0000-4000-8000-000000000605","type":"rich_text","schemaVersion":1,"data":{"text":"Time to apply the basics in a structured exercise."},"position":"a0"},{"id":"00000000-0000-4000-8000-000000000606","type":"checklist","schemaVersion":1,"data":{"items":[{"id":"00000000-0000-4000-8000-0000000006a1","text":"Review the principles"},{"id":"00000000-0000-4000-8000-0000000006a2","text":"Complete the worksheet"}]},"position":"a1"}]',
   '00000000-0000-4000-8000-000000000014'),
  ('00000000-0000-4000-8000-000000000714', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000534', '00000000-0000-4000-8000-000000000512', 1, 'Advanced Methods', true,
   '[{"id":"00000000-0000-4000-8000-000000000607","type":"rich_text","schemaVersion":1,"data":{"text":"Advanced methods extend the foundations with judgment under constraints."},"position":"a0"}]',
   '00000000-0000-4000-8000-000000000014'),
  ('00000000-0000-4000-8000-000000000715', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000535', '00000000-0000-4000-8000-000000000512', 1, 'Capstone Review', true,
   '[{"id":"00000000-0000-4000-8000-000000000608","type":"rich_text","schemaVersion":1,"data":{"text":"The capstone review consolidates everything from this track."},"position":"a0"}]',
   '00000000-0000-4000-8000-000000000014'),
  ('00000000-0000-4000-8000-000000000716', '00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000536', '00000000-0000-4000-8000-000000000513', 1, 'Movement Screening Session', true,
   '[{"id":"00000000-0000-4000-8000-000000000609","type":"rich_text","schemaVersion":1,"data":{"text":"Screen movement patterns before programming. Observe, do not correct yet."},"position":"a0"}]',
   '00000000-0000-4000-8000-000000000014'),
  ('00000000-0000-4000-8000-000000000717', '00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000537', '00000000-0000-4000-8000-000000000513', 1, 'Client Intake Session', true,
   '[{"id":"00000000-0000-4000-8000-000000000610","type":"rich_text","schemaVersion":1,"data":{"text":"A structured intake builds trust and surfaces constraints early."},"position":"a0"}]',
   '00000000-0000-4000-8000-000000000014')
on conflict (id) do nothing;

update public.lessons set current_published_version_id = '00000000-0000-4000-8000-000000000711', status = 'published' where id = '00000000-0000-4000-8000-000000000531' and current_published_version_id is null;
update public.lessons set current_published_version_id = '00000000-0000-4000-8000-000000000712', status = 'published' where id = '00000000-0000-4000-8000-000000000532' and current_published_version_id is null;
update public.lessons set current_published_version_id = '00000000-0000-4000-8000-000000000713', status = 'published' where id = '00000000-0000-4000-8000-000000000533' and current_published_version_id is null;
update public.lessons set current_published_version_id = '00000000-0000-4000-8000-000000000714', status = 'published' where id = '00000000-0000-4000-8000-000000000534' and current_published_version_id is null;
update public.lessons set current_published_version_id = '00000000-0000-4000-8000-000000000715', status = 'published' where id = '00000000-0000-4000-8000-000000000535' and current_published_version_id is null;
update public.lessons set current_published_version_id = '00000000-0000-4000-8000-000000000716', status = 'published' where id = '00000000-0000-4000-8000-000000000536' and current_published_version_id is null;
update public.lessons set current_published_version_id = '00000000-0000-4000-8000-000000000717', status = 'published' where id = '00000000-0000-4000-8000-000000000537' and current_published_version_id is null;

insert into public.course_versions (id, organization_id, course_id, version_number, title, summary, structure, completion_rule, published_by) values
  ('00000000-0000-4000-8000-000000000701', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000511', 1,
   'Foundations of Practice', 'Orientation and core principles.',
   '{"schemaVersion":1,"modules":[{"moduleId":"00000000-0000-4000-8000-000000000521","title":"Getting Started","position":"a0","lessons":[{"lessonId":"00000000-0000-4000-8000-000000000531","lessonVersionId":"00000000-0000-4000-8000-000000000711","versionNumber":1,"title":"Welcome & Orientation","position":"a0","required":true},{"lessonId":"00000000-0000-4000-8000-000000000532","lessonVersionId":"00000000-0000-4000-8000-000000000712","versionNumber":1,"title":"Principles","position":"a1","required":true}]},{"moduleId":"00000000-0000-4000-8000-000000000522","title":"Core Concepts","position":"a1","lessons":[{"lessonId":"00000000-0000-4000-8000-000000000533","lessonVersionId":"00000000-0000-4000-8000-000000000713","versionNumber":1,"title":"Applying the Basics","position":"a0","required":true}]}]}',
   '{"schemaVersion":1,"type":"all_required_lessons"}', '00000000-0000-4000-8000-000000000014'),
  ('00000000-0000-4000-8000-000000000702', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000512', 1,
   'Advanced Practice', 'Advanced methods building on the foundations.',
   '{"schemaVersion":1,"modules":[{"moduleId":"00000000-0000-4000-8000-000000000523","title":"Advanced Modules","position":"a0","lessons":[{"lessonId":"00000000-0000-4000-8000-000000000534","lessonVersionId":"00000000-0000-4000-8000-000000000714","versionNumber":1,"title":"Advanced Methods","position":"a0","required":true},{"lessonId":"00000000-0000-4000-8000-000000000535","lessonVersionId":"00000000-0000-4000-8000-000000000715","versionNumber":1,"title":"Capstone Review","position":"a1","required":true}]}]}',
   '{"schemaVersion":1,"type":"all_required_lessons"}', '00000000-0000-4000-8000-000000000014'),
  ('00000000-0000-4000-8000-000000000703', '00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000513', 1,
   'Foundations Program', 'The first program in the certification journey.',
   '{"schemaVersion":1,"modules":[{"moduleId":"00000000-0000-4000-8000-000000000524","title":"Phase One","position":"a0","lessons":[{"lessonId":"00000000-0000-4000-8000-000000000536","lessonVersionId":"00000000-0000-4000-8000-000000000716","versionNumber":1,"title":"Movement Screening Session","position":"a0","required":true},{"lessonId":"00000000-0000-4000-8000-000000000537","lessonVersionId":"00000000-0000-4000-8000-000000000717","versionNumber":1,"title":"Client Intake Session","position":"a1","required":true}]}]}',
   '{"schemaVersion":1,"type":"all_required_lessons"}', '00000000-0000-4000-8000-000000000014')
on conflict (id) do nothing;

update public.courses set current_published_version_id = '00000000-0000-4000-8000-000000000701', status = 'published' where id = '00000000-0000-4000-8000-000000000511' and current_published_version_id is null;
update public.courses set current_published_version_id = '00000000-0000-4000-8000-000000000702', status = 'published' where id = '00000000-0000-4000-8000-000000000512' and current_published_version_id is null;
update public.courses set current_published_version_id = '00000000-0000-4000-8000-000000000703', status = 'published' where id = '00000000-0000-4000-8000-000000000513' and current_published_version_id is null;

update public.lessons set title = 'Welcome & Orientation (Refreshed)'
 where id = '00000000-0000-4000-8000-000000000531' and title = 'Welcome & Orientation';
update public.courses set summary = 'Orientation and core principles - 2026 refresh in draft.'
 where id = '00000000-0000-4000-8000-000000000511' and summary = 'Orientation and core principles.';

insert into public.path_nodes (id, organization_id, path_id, course_id, position) values
  ('00000000-0000-4000-8000-000000000541', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000502', '00000000-0000-4000-8000-000000000511', 'a0'),
  ('00000000-0000-4000-8000-000000000542', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000502', '00000000-0000-4000-8000-000000000512', 'a1'),
  ('00000000-0000-4000-8000-000000000543', '00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000504', '00000000-0000-4000-8000-000000000513', 'a0')
on conflict (id) do nothing;

insert into public.prerequisites (id, organization_id, path_id, node_id, requires_node_id) values
  ('00000000-0000-4000-8000-000000000551', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000502',
   '00000000-0000-4000-8000-000000000542', '00000000-0000-4000-8000-000000000541')
on conflict (id) do nothing;

insert into public.enrollments (id, organization_id, membership_id, target_type, learning_path_id, course_id, pinned_course_version_id, status, source, started_at, completed_at) values
  ('00000000-0000-4000-8000-000000000561', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000306',
   'learning_path', '00000000-0000-4000-8000-000000000502', null, null, 'active', 'assigned', now(), null),
  ('00000000-0000-4000-8000-000000000562', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000304',
   'course', null, '00000000-0000-4000-8000-000000000511', '00000000-0000-4000-8000-000000000701', 'completed', 'assigned', now(), now()),
  ('00000000-0000-4000-8000-000000000563', '00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000314',
   'learning_path', '00000000-0000-4000-8000-000000000504', null, null, 'active', 'assigned', now(), null)
on conflict (id) do nothing;

insert into public.progress_records (id, organization_id, enrollment_id, subject_type, course_id, lesson_id, course_version_id, lesson_version_id, status, completed_at) values
  ('00000000-0000-4000-8000-000000000571', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000561', 'course', '00000000-0000-4000-8000-000000000511', null, '00000000-0000-4000-8000-000000000701', null, 'in_progress', null),
  ('00000000-0000-4000-8000-000000000572', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000561', 'lesson', '00000000-0000-4000-8000-000000000511', '00000000-0000-4000-8000-000000000531', '00000000-0000-4000-8000-000000000701', '00000000-0000-4000-8000-000000000711', 'completed', now()),
  ('00000000-0000-4000-8000-000000000573', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000561', 'lesson', '00000000-0000-4000-8000-000000000511', '00000000-0000-4000-8000-000000000532', '00000000-0000-4000-8000-000000000701', '00000000-0000-4000-8000-000000000712', 'in_progress', null),
  ('00000000-0000-4000-8000-000000000574', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000562', 'course', '00000000-0000-4000-8000-000000000511', null, '00000000-0000-4000-8000-000000000701', null, 'completed', now()),
  ('00000000-0000-4000-8000-000000000575', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000562', 'lesson', '00000000-0000-4000-8000-000000000511', '00000000-0000-4000-8000-000000000531', '00000000-0000-4000-8000-000000000701', '00000000-0000-4000-8000-000000000711', 'completed', now()),
  ('00000000-0000-4000-8000-000000000576', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000562', 'lesson', '00000000-0000-4000-8000-000000000511', '00000000-0000-4000-8000-000000000532', '00000000-0000-4000-8000-000000000701', '00000000-0000-4000-8000-000000000712', 'completed', now()),
  ('00000000-0000-4000-8000-000000000577', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000562', 'lesson', '00000000-0000-4000-8000-000000000511', '00000000-0000-4000-8000-000000000533', '00000000-0000-4000-8000-000000000701', '00000000-0000-4000-8000-000000000713', 'completed', now()),
  ('00000000-0000-4000-8000-000000000578', '00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000563', 'course', '00000000-0000-4000-8000-000000000513', null, '00000000-0000-4000-8000-000000000703', null, 'in_progress', null),
  ('00000000-0000-4000-8000-000000000579', '00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000563', 'lesson', '00000000-0000-4000-8000-000000000513', '00000000-0000-4000-8000-000000000536', '00000000-0000-4000-8000-000000000703', '00000000-0000-4000-8000-000000000716', 'completed', now())
on conflict (id) do nothing;
