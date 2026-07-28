-- NovaKore Phase 1D — assessment, review, and credential foundation.
-- Draft rows are mutable; published assessment_versions stay immutable
-- (trigger from 1C). Attempts/responses/reviews/credentials are evidence:
-- client write grants are revoked and every mutation flows through the
-- SECURITY DEFINER RPCs in the companion operations migration.

-- ---------------------------------------------------------------------------
-- 1. Permissions (finite catalog additions) + role bundles.
--    Backfill existing organizations AND revise app.create_system_roles in
--    the same migration — the Phase 1C progress.override defect class.
-- ---------------------------------------------------------------------------
insert into public.permissions (code, description, category) values
  ('assessment.publish', 'Publish immutable assessment versions', 'assessment'),
  ('assessment.assign', 'Attach assessments to learning content', 'assessment'),
  ('assessment.override', 'Reopen or regrade finalized attempts (audited)', 'assessment'),
  ('credential.issue', 'Issue credentials manually', 'credential'),
  ('credential.revoke', 'Revoke issued credentials (audited)', 'credential')
on conflict (code) do nothing;

do $$
begin
  perform pg_catalog.set_config('app.system_role_maintenance', 'true', true);

  insert into public.organization_role_permissions (organization_id, role_id, permission_code)
  select r.organization_id, r.id, p.code
  from public.organization_roles r
  cross join (values
    ('organization_owner', 'assessment.publish'),
    ('organization_owner', 'assessment.assign'),
    ('organization_owner', 'assessment.override'),
    ('organization_owner', 'credential.issue'),
    ('organization_owner', 'credential.revoke'),
    ('organization_admin', 'assessment.publish'),
    ('organization_admin', 'assessment.assign'),
    ('organization_admin', 'assessment.override'),
    ('organization_admin', 'credential.issue'),
    ('organization_admin', 'credential.revoke'),
    ('academy_admin', 'assessment.publish'),
    ('academy_admin', 'assessment.assign'),
    ('reviewer', 'assessment.publish')
  ) as p(role_key, code)
  where r.is_system and r.key = p.role_key
  on conflict (role_id, permission_code) do nothing;
end;
$$;

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
        array['org.manage','org.members.manage','org.roles.manage','org.branding.manage','org.branding.publish','org.terminology.manage','academy.manage','content.view_draft','content.author','content.publish','content.archive','paths.manage','assessment.author','assessment.publish','assessment.assign','assessment.grade','assessment.override','enrollment.manage','enrollment.self','progress.view.own','progress.view.others','progress.override','certificates.manage','credential.issue','credential.revoke','analytics.view','audit.view','integrations.manage','ai.author.use']),
      ('organization_admin', 'Organization Admin',
        'Administers the organization on the owner''s behalf.',
        array['org.manage','org.members.manage','org.roles.manage','org.branding.manage','org.branding.publish','org.terminology.manage','academy.manage','content.view_draft','content.author','content.publish','content.archive','paths.manage','assessment.author','assessment.publish','assessment.assign','assessment.grade','assessment.override','enrollment.manage','enrollment.self','progress.view.own','progress.view.others','progress.override','certificates.manage','credential.issue','credential.revoke','analytics.view','audit.view','integrations.manage','ai.author.use']),
      ('academy_admin', 'Academy Admin',
        'Administers assigned academies.',
        array['academy.manage','content.view_draft','content.author','content.publish','content.archive','paths.manage','assessment.author','assessment.publish','assessment.assign','assessment.grade','enrollment.manage','enrollment.self','progress.view.own','progress.view.others','analytics.view','ai.author.use']),
      ('author', 'Author',
        'Creates and edits draft content. Publishing requires a separate role.',
        array['content.view_draft','content.author','paths.manage','assessment.author','enrollment.self','progress.view.own','ai.author.use']),
      ('reviewer', 'Reviewer',
        'Reviews and publishes content.',
        array['content.view_draft','content.publish','assessment.publish','assessment.grade','enrollment.self','progress.view.own']),
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
-- 2. Assessments gain a published status (1C durable minimum allowed only
--    draft/archived) and event emission on create/meaningful update.
-- ---------------------------------------------------------------------------
alter table public.assessments drop constraint assessments_status_check;
alter table public.assessments
  add constraint assessments_status_check
  check (status in ('draft', 'published', 'archived'));

create or replace function app.emit_assessment_authoring_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform app.emit_event(
      new.organization_id, 'content.assessment.created', 'assessment', new.id,
      '{}'::jsonb,
      jsonb_build_object('assessment_type', new.assessment_type),
      'assessment-created:' || new.id::text
    );
  elsif new.title is distinct from old.title
     or new.settings is distinct from old.settings
     or new.assessment_type is distinct from old.assessment_type then
    perform app.emit_event(
      new.organization_id, 'content.assessment.updated', 'assessment', new.id,
      '{}'::jsonb, '{}'::jsonb,
      'assessment-updated:' || new.id::text || ':' || extract(epoch from clock_timestamp())::text
    );
  end if;
  return new;
end;
$$;

create trigger emit_assessment_authoring_event
  after insert or update on public.assessments
  for each row execute function app.emit_assessment_authoring_event();

-- ---------------------------------------------------------------------------
-- 3. assessment_items — mutable draft questions (frozen into versions)
-- ---------------------------------------------------------------------------
create table public.assessment_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  assessment_id uuid not null,
  item_type text not null check (item_type in (
    'multiple_choice', 'multiple_select', 'true_false',
    'short_answer', 'long_answer', 'file_submission'
  )),
  schema_version integer not null check (schema_version >= 1),
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  position text not null check (char_length(position) between 1 and 40),
  required boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (assessment_id, position) deferrable initially deferred,
  unique (id, organization_id),
  foreign key (assessment_id, organization_id)
    references public.assessments (id, organization_id) on delete cascade
);
create index assessment_items_assessment_idx on public.assessment_items (assessment_id);

-- ---------------------------------------------------------------------------
-- 4. assessment_assignments — pins an exact published version to a lesson.
--    course_id is denormalized so learner visibility reuses
--    app.can_access_course without reading staff-only lesson rows.
-- ---------------------------------------------------------------------------
create table public.assessment_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  course_id uuid not null,
  lesson_id uuid not null,
  assessment_id uuid not null,
  assessment_version_id uuid not null references public.assessment_versions (id),
  required boolean not null default true,
  completion_effect text not null default 'complete_lesson'
    check (completion_effect in ('complete_lesson', 'none')),
  position text not null default 'a0' check (char_length(position) between 1 and 40),
  available_from timestamptz,
  available_until timestamptz,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (available_from is null or available_until is null or available_from < available_until),
  unique (id, organization_id),
  -- course_id is copied from the lesson row inside assign_assessment;
  -- lessons carry no (id, course_id) unique key, so the org-scoped FK is
  -- the referential anchor and the RPC is the consistency guarantee.
  foreign key (lesson_id, organization_id)
    references public.lessons (id, organization_id) on delete cascade,
  foreign key (course_id, organization_id)
    references public.courses (id, organization_id) on delete cascade,
  foreign key (assessment_id, organization_id)
    references public.assessments (id, organization_id)
);
create unique index assessment_assignments_one_active
  on public.assessment_assignments (lesson_id, assessment_id)
  where status = 'active';
create index assessment_assignments_lesson_idx on public.assessment_assignments (lesson_id);
create index assessment_assignments_org_idx on public.assessment_assignments (organization_id, status);

-- ---------------------------------------------------------------------------
-- 5. assessment_attempts — evidence pinned to the exact version seen
-- ---------------------------------------------------------------------------
create table public.assessment_attempts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  assignment_id uuid not null,
  enrollment_id uuid not null,
  membership_id uuid not null,
  assessment_id uuid not null,
  assessment_version_id uuid not null references public.assessment_versions (id),
  course_id uuid not null,
  lesson_id uuid not null,
  attempt_number integer not null check (attempt_number >= 1),
  status text not null default 'started' check (status in (
    'started', 'submitted', 'pending_review', 'passed', 'failed', 'abandoned', 'expired'
  )),
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  finalized_at timestamptz,
  -- time-limit snapshot: authority is the server clock, never the browser
  time_limit_minutes integer check (time_limit_minutes is null or time_limit_minutes between 1 and 600),
  expires_at timestamptz,
  passing_percent integer not null check (passing_percent between 1 and 100),
  points_earned numeric(8,2),
  points_possible numeric(8,2),
  score_percent numeric(5,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status not in ('passed', 'failed')
         or (finalized_at is not null and score_percent is not null)),
  unique (id, organization_id),
  unique (assignment_id, enrollment_id, attempt_number),
  foreign key (assignment_id, organization_id)
    references public.assessment_assignments (id, organization_id) on delete cascade,
  foreign key (enrollment_id, organization_id)
    references public.enrollments (id, organization_id) on delete cascade,
  foreign key (membership_id, organization_id)
    references public.organization_memberships (id, organization_id)
);
-- one open attempt per learner per assignment
create unique index assessment_attempts_one_open
  on public.assessment_attempts (assignment_id, enrollment_id)
  where status in ('started', 'submitted', 'pending_review');
create index assessment_attempts_org_idx on public.assessment_attempts (organization_id, status);
create index assessment_attempts_membership_idx on public.assessment_attempts (membership_id);
create index assessment_attempts_assignment_idx on public.assessment_attempts (assignment_id);

-- ---------------------------------------------------------------------------
-- 6. assessment_responses — one row per (attempt, item); correct-answer
--    configuration NEVER lives here, only the learner's response + grades
-- ---------------------------------------------------------------------------
create table public.assessment_responses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  attempt_id uuid not null,
  item_id uuid not null,
  item_type text not null check (item_type in (
    'multiple_choice', 'multiple_select', 'true_false',
    'short_answer', 'long_answer', 'file_submission'
  )),
  response jsonb not null check (jsonb_typeof(response) = 'object'),
  points_possible numeric(8,2),
  points_earned numeric(8,2),
  correct boolean,
  needs_review boolean not null default false,
  reviewed_points numeric(8,2),
  reviewer_feedback text check (reviewer_feedback is null or char_length(reviewer_feedback) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (attempt_id, item_id),
  unique (id, organization_id),
  foreign key (attempt_id, organization_id)
    references public.assessment_attempts (id, organization_id) on delete cascade
);
create index assessment_responses_attempt_idx on public.assessment_responses (attempt_id);

-- ---------------------------------------------------------------------------
-- 7. assessment_reviews — one review record per attempt (re-review is an
--    audited assessment.override path, documented in manual-review.md)
-- ---------------------------------------------------------------------------
create table public.assessment_reviews (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  attempt_id uuid not null unique,
  status text not null default 'pending_review'
    check (status in ('pending_review', 'in_review', 'completed')),
  reviewer_id uuid,
  decision text check (decision is null or decision in ('passed', 'failed')),
  overall_feedback text check (overall_feedback is null or char_length(overall_feedback) <= 5000),
  claimed_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'completed') = (decision is not null and completed_at is not null)),
  unique (id, organization_id),
  foreign key (attempt_id, organization_id)
    references public.assessment_attempts (id, organization_id) on delete cascade
);
create index assessment_reviews_org_status_idx on public.assessment_reviews (organization_id, status);

-- ---------------------------------------------------------------------------
-- 8. certificate_templates + certificates (issuance definitions)
-- ---------------------------------------------------------------------------
create table public.certificate_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  academy_id uuid,
  name text not null check (char_length(name) between 2 and 200),
  template jsonb not null check (jsonb_typeof(template) = 'object'),
  schema_version integer not null default 1 check (schema_version >= 1),
  status text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (id, organization_id),
  foreign key (academy_id, organization_id)
    references public.academies (id, organization_id)
);
create index certificate_templates_org_idx on public.certificate_templates (organization_id, status);

create table public.certificates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  template_id uuid not null,
  title text not null check (char_length(title) between 2 and 200),
  source_type text not null check (source_type in ('course', 'learning_path', 'assessment_assignment')),
  course_id uuid,
  learning_path_id uuid,
  assignment_id uuid,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((source_type = 'course') = (course_id is not null)),
  check ((source_type = 'learning_path') = (learning_path_id is not null)),
  check ((source_type = 'assessment_assignment') = (assignment_id is not null)),
  unique (id, organization_id),
  foreign key (template_id, organization_id)
    references public.certificate_templates (id, organization_id),
  foreign key (course_id, organization_id)
    references public.courses (id, organization_id) on delete cascade,
  foreign key (learning_path_id, organization_id)
    references public.learning_paths (id, organization_id) on delete cascade,
  foreign key (assignment_id, organization_id)
    references public.assessment_assignments (id, organization_id) on delete cascade
);
create unique index certificates_one_active_course
  on public.certificates (course_id) where status = 'active' and course_id is not null;
create unique index certificates_one_active_path
  on public.certificates (learning_path_id) where status = 'active' and learning_path_id is not null;
create unique index certificates_one_active_assignment
  on public.certificates (assignment_id) where status = 'active' and assignment_id is not null;
create index certificates_org_idx on public.certificates (organization_id, status);

-- ---------------------------------------------------------------------------
-- 9. issued_credentials — immutable evidence with a public-safe
--    verification identifier (never the row UUID)
-- ---------------------------------------------------------------------------
create table public.issued_credentials (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  certificate_id uuid not null,
  membership_id uuid not null,
  recipient_name text not null check (char_length(recipient_name) between 1 and 120),
  title text not null check (char_length(title) between 2 and 200),
  template_snapshot jsonb not null check (jsonb_typeof(template_snapshot) = 'object'),
  verification_code text not null unique
    check (verification_code ~ '^NVK-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$'),
  status text not null default 'active' check (status in ('active', 'expired', 'revoked')),
  issued_at timestamptz not null default now(),
  issued_by uuid, -- null = automatic issuance
  expires_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid,
  revocation_reason text check (revocation_reason is null or char_length(revocation_reason) <= 500),
  -- evidence references (exact versions)
  enrollment_id uuid,
  course_version_id uuid references public.course_versions (id),
  attempt_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'revoked') = (revoked_at is not null and revocation_reason is not null)),
  unique (id, organization_id),
  foreign key (certificate_id, organization_id)
    references public.certificates (id, organization_id),
  foreign key (membership_id, organization_id)
    references public.organization_memberships (id, organization_id),
  foreign key (enrollment_id, organization_id)
    references public.enrollments (id, organization_id),
  foreign key (attempt_id, organization_id)
    references public.assessment_attempts (id, organization_id)
);
-- idempotent issuance: one non-revoked credential per rule per member
create unique index issued_credentials_one_live
  on public.issued_credentials (certificate_id, membership_id)
  where status <> 'revoked';
create index issued_credentials_org_idx on public.issued_credentials (organization_id, status);
create index issued_credentials_membership_idx on public.issued_credentials (membership_id);

-- Issued credentials are evidence: only status/revocation fields may change.
create or replace function app.protect_issued_credential()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.certificate_id      is distinct from old.certificate_id
  or new.membership_id       is distinct from old.membership_id
  or new.recipient_name      is distinct from old.recipient_name
  or new.title               is distinct from old.title
  or new.template_snapshot   is distinct from old.template_snapshot
  or new.verification_code   is distinct from old.verification_code
  or new.issued_at           is distinct from old.issued_at
  or new.issued_by           is distinct from old.issued_by
  or new.expires_at          is distinct from old.expires_at
  or new.enrollment_id       is distinct from old.enrollment_id
  or new.course_version_id   is distinct from old.course_version_id
  or new.attempt_id          is distinct from old.attempt_id
  or new.organization_id     is distinct from old.organization_id then
    raise exception 'issued credentials are immutable evidence (only status may change)'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger protect_issued_credential before update on public.issued_credentials
  for each row execute function app.protect_issued_credential();
create trigger protect_immutable before delete on public.issued_credentials
  for each row execute function app.protect_immutable();

-- ---------------------------------------------------------------------------
-- 10. Shared triggers (updated_at + audit)
-- ---------------------------------------------------------------------------
create trigger set_updated_at before update on public.assessment_items
  for each row execute function app.set_updated_at();
create trigger set_updated_at before update on public.assessment_assignments
  for each row execute function app.set_updated_at();
create trigger set_updated_at before update on public.assessment_attempts
  for each row execute function app.set_updated_at();
create trigger set_updated_at before update on public.assessment_responses
  for each row execute function app.set_updated_at();
create trigger set_updated_at before update on public.assessment_reviews
  for each row execute function app.set_updated_at();
create trigger set_updated_at before update on public.certificate_templates
  for each row execute function app.set_updated_at();
create trigger set_updated_at before update on public.certificates
  for each row execute function app.set_updated_at();
create trigger set_updated_at before update on public.issued_credentials
  for each row execute function app.set_updated_at();

-- assessment_items intentionally not audited row-by-row (draft keystroke
-- noise, same rationale as content_blocks); the published version insert is
-- the audited artifact.
create trigger audit_change after insert or update on public.assessment_assignments
  for each row execute function app.audit_change('assessment_assignment');
create trigger audit_change after insert or update on public.assessment_attempts
  for each row execute function app.audit_change('assessment_attempt');
create trigger audit_change after insert or update on public.assessment_reviews
  for each row execute function app.audit_change('assessment_review');
create trigger audit_change after insert or update on public.certificate_templates
  for each row execute function app.audit_change('certificate_template');
create trigger audit_change after insert or update on public.certificates
  for each row execute function app.audit_change('certificate');
create trigger audit_change after insert or update on public.issued_credentials
  for each row execute function app.audit_change('issued_credential');

-- ---------------------------------------------------------------------------
-- 11. Grants hygiene + RLS
-- ---------------------------------------------------------------------------
revoke all on public.assessment_items, public.assessment_assignments,
  public.assessment_attempts, public.assessment_responses,
  public.assessment_reviews, public.certificate_templates,
  public.certificates, public.issued_credentials
from anon;

-- RPC-only write paths
revoke insert, update, delete on public.assessment_assignments from authenticated;
revoke insert, update, delete on public.assessment_attempts from authenticated;
revoke insert, update, delete on public.assessment_responses from authenticated;
revoke insert, update, delete on public.assessment_reviews from authenticated;
revoke insert, update, delete on public.issued_credentials from authenticated;

alter table public.assessment_items enable row level security;
alter table public.assessment_assignments enable row level security;
alter table public.assessment_attempts enable row level security;
alter table public.assessment_responses enable row level security;
alter table public.assessment_reviews enable row level security;
alter table public.certificate_templates enable row level security;
alter table public.certificates enable row level security;
alter table public.issued_credentials enable row level security;

-- Draft items carry correct-answer configuration: staff-only, always.
create policy assessment_items_select on public.assessment_items
  for select to authenticated
  using (app.has_org_permission(organization_id, 'content.view_draft'));
create policy assessment_items_insert on public.assessment_items
  for insert to authenticated
  with check (app.has_org_permission(organization_id, 'assessment.author'));
create policy assessment_items_update on public.assessment_items
  for update to authenticated
  using (app.has_org_permission(organization_id, 'assessment.author'))
  with check (app.has_org_permission(organization_id, 'assessment.author'));
create policy assessment_items_delete on public.assessment_items
  for delete to authenticated
  using (app.has_org_permission(organization_id, 'assessment.author'));

-- Assignments are visible wherever the course is (drafts to staff,
-- published courses to covered learners).
create policy assessment_assignments_select on public.assessment_assignments
  for select to authenticated
  using (app.can_access_course(organization_id, course_id));

-- Learners may read the metadata row (title/status — never items) of a
-- PUBLISHED assessment actively assigned to a course they can access.
create policy assessments_select_assigned on public.assessments
  for select to authenticated
  using (
    status = 'published'
    and exists (
      select 1 from public.assessment_assignments asg
      where asg.assessment_id = id
        and asg.status = 'active'
        and app.can_access_course(asg.organization_id, asg.course_id)
    )
  );

-- Attempts: own rows, reviewers/graders, or progress viewers.
create policy assessment_attempts_select on public.assessment_attempts
  for select to authenticated
  using (
    app.has_org_permission(organization_id, 'assessment.grade')
    or app.has_org_permission(organization_id, 'progress.view.others')
    or exists (
      select 1 from public.organization_memberships m
      where m.id = membership_id and m.user_id = (select auth.uid())
    )
  );

create policy assessment_responses_select on public.assessment_responses
  for select to authenticated
  using (
    app.has_org_permission(organization_id, 'assessment.grade')
    or exists (
      select 1
      from public.assessment_attempts a
      join public.organization_memberships m on m.id = a.membership_id
      where a.id = attempt_id and m.user_id = (select auth.uid())
    )
  );

create policy assessment_reviews_select on public.assessment_reviews
  for select to authenticated
  using (
    app.has_org_permission(organization_id, 'assessment.grade')
    or exists (
      select 1
      from public.assessment_attempts a
      join public.organization_memberships m on m.id = a.membership_id
      where a.id = attempt_id and m.user_id = (select auth.uid())
    )
  );

-- Certificate authoring: certificates.manage end to end.
create policy certificate_templates_select on public.certificate_templates
  for select to authenticated
  using (app.has_org_permission(organization_id, 'certificates.manage'));
create policy certificate_templates_insert on public.certificate_templates
  for insert to authenticated
  with check (app.has_org_permission(organization_id, 'certificates.manage'));
create policy certificate_templates_update on public.certificate_templates
  for update to authenticated
  using (app.has_org_permission(organization_id, 'certificates.manage'))
  with check (app.has_org_permission(organization_id, 'certificates.manage'));

create policy certificates_select on public.certificates
  for select to authenticated
  using (app.has_org_permission(organization_id, 'certificates.manage'));
create policy certificates_insert on public.certificates
  for insert to authenticated
  with check (app.has_org_permission(organization_id, 'certificates.manage'));
create policy certificates_update on public.certificates
  for update to authenticated
  using (app.has_org_permission(organization_id, 'certificates.manage'))
  with check (app.has_org_permission(organization_id, 'certificates.manage'));

-- Issued credentials: the recipient and credential managers.
create policy issued_credentials_select on public.issued_credentials
  for select to authenticated
  using (
    app.has_org_permission(organization_id, 'certificates.manage')
    or exists (
      select 1 from public.organization_memberships m
      where m.id = membership_id and m.user_id = (select auth.uid())
    )
  );
