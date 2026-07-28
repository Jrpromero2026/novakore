-- NovaKore Phase 1C — learning domain foundation
-- Canonical entities per docs/architecture/entity-model.md. Draft rows are
-- editable; published *_versions are immutable snapshots (ADR-007/008).
-- Progress pins exact version ids. RLS on every table.

-- ---------------------------------------------------------------------------
-- Permission: manual progress override is a distinct, audited act.
-- ---------------------------------------------------------------------------
insert into public.permissions (code, description, category) values
  ('progress.override', 'Manually override learner progress (audited)', 'progress')
on conflict (code) do nothing;

do $$
begin
  perform pg_catalog.set_config('app.system_role_maintenance', 'true', true);
  insert into public.organization_role_permissions (organization_id, role_id, permission_code)
  select r.organization_id, r.id, 'progress.override'
  from public.organization_roles r
  where r.is_system and r.key in ('organization_owner', 'organization_admin')
  on conflict (role_id, permission_code) do nothing;
end;
$$;

-- ---------------------------------------------------------------------------
-- learning_systems (academy-scoped governed frameworks)
-- ---------------------------------------------------------------------------
create table public.learning_systems (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  academy_id uuid not null,
  slug text not null check (slug ~ '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$'),
  title text not null check (char_length(title) between 2 and 200),
  description text check (description is null or char_length(description) <= 2000),
  status text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (academy_id, slug),
  unique (id, organization_id),
  foreign key (academy_id, organization_id)
    references public.academies (id, organization_id) on delete cascade
);
create index learning_systems_org_idx on public.learning_systems (organization_id, status);

-- ---------------------------------------------------------------------------
-- learning_paths (sequenced course graphs inside a system)
-- ---------------------------------------------------------------------------
create table public.learning_paths (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  academy_id uuid not null,
  learning_system_id uuid not null,
  slug text not null check (slug ~ '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$'),
  title text not null check (char_length(title) between 2 and 200),
  description text check (description is null or char_length(description) <= 2000),
  status text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  allow_self_enrollment boolean not null default false,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (learning_system_id, slug),
  unique (id, organization_id),
  foreign key (learning_system_id, organization_id)
    references public.learning_systems (id, organization_id) on delete cascade,
  foreign key (academy_id, organization_id)
    references public.academies (id, organization_id) on delete cascade
);
create index learning_paths_org_idx on public.learning_paths (organization_id, status);
create index learning_paths_system_idx on public.learning_paths (learning_system_id);

-- ---------------------------------------------------------------------------
-- courses (organization-owned canonical units — entity-model §3.1)
-- ---------------------------------------------------------------------------
create table public.courses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$'),
  title text not null check (char_length(title) between 2 and 200),
  summary text check (summary is null or char_length(summary) <= 500),
  description text check (description is null or char_length(description) <= 5000),
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  completion_rule jsonb not null
    default '{"schemaVersion":1,"type":"all_required_lessons"}'::jsonb
    check (jsonb_typeof(completion_rule) = 'object'),
  allow_self_enrollment boolean not null default false,
  current_published_version_id uuid,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (organization_id, slug),
  unique (id, organization_id)
);
create index courses_org_idx on public.courses (organization_id, status);

-- ---------------------------------------------------------------------------
-- path_nodes (ordered course entries within a path) + prerequisites
-- ---------------------------------------------------------------------------
create table public.path_nodes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  path_id uuid not null,
  course_id uuid not null,
  position text not null check (char_length(position) between 1 and 40),
  created_at timestamptz not null default now(),
  created_by uuid,
  unique (path_id, course_id),
  unique (id, path_id),
  unique (id, organization_id),
  foreign key (path_id, organization_id)
    references public.learning_paths (id, organization_id) on delete cascade,
  foreign key (course_id, organization_id)
    references public.courses (id, organization_id) on delete cascade
);
create index path_nodes_path_idx on public.path_nodes (path_id);
create index path_nodes_course_idx on public.path_nodes (course_id);

create table public.prerequisites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  path_id uuid not null,
  node_id uuid not null,
  requires_node_id uuid not null,
  requirement text not null default 'completed' check (requirement = 'completed'),
  created_at timestamptz not null default now(),
  created_by uuid,
  check (node_id <> requires_node_id),
  unique (node_id, requires_node_id),
  foreign key (node_id, path_id)
    references public.path_nodes (id, path_id) on delete cascade,
  foreign key (requires_node_id, path_id)
    references public.path_nodes (id, path_id) on delete cascade,
  foreign key (path_id, organization_id)
    references public.learning_paths (id, organization_id) on delete cascade
);
create index prerequisites_node_idx on public.prerequisites (node_id);
create index prerequisites_path_idx on public.prerequisites (path_id);

-- Authoritative cycle prevention (DFS via recursive CTE; the domain package
-- mirrors this check for authoring UX). Self-cycles blocked by CHECK above.
create or replace function app.prevent_prerequisite_cycles()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_cycle boolean;
begin
  with recursive reach(node) as (
    select new.requires_node_id
    union
    select p.requires_node_id
    from public.prerequisites p
    join reach r on p.node_id = r.node
    where p.path_id = new.path_id
  )
  select exists (select 1 from reach where node = new.node_id) into v_cycle;

  if v_cycle then
    raise exception 'prerequisite would create a cycle' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger prevent_prerequisite_cycles
  before insert or update on public.prerequisites
  for each row execute function app.prevent_prerequisite_cycles();

-- ---------------------------------------------------------------------------
-- modules (structural containers; frozen inside course_versions — no
-- module_versions table, per the approved entity model)
-- ---------------------------------------------------------------------------
create table public.modules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  course_id uuid not null,
  title text not null check (char_length(title) between 1 and 200),
  description text check (description is null or char_length(description) <= 2000),
  position text not null check (char_length(position) between 1 and 40),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (course_id, position) deferrable initially deferred,
  unique (id, course_id),
  unique (id, organization_id),
  foreign key (course_id, organization_id)
    references public.courses (id, organization_id) on delete cascade
);
create index modules_course_idx on public.modules (course_id);

-- ---------------------------------------------------------------------------
-- lessons (draft containers of ordered blocks)
-- ---------------------------------------------------------------------------
create table public.lessons (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  course_id uuid not null,
  module_id uuid not null,
  title text not null check (char_length(title) between 1 and 200),
  summary text check (summary is null or char_length(summary) <= 500),
  required boolean not null default true,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  position text not null check (char_length(position) between 1 and 40),
  estimated_minutes integer check (estimated_minutes is null or (estimated_minutes > 0 and estimated_minutes <= 600)),
  current_published_version_id uuid,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (module_id, position) deferrable initially deferred,
  unique (id, organization_id),
  foreign key (module_id, course_id)
    references public.modules (id, course_id) on delete cascade,
  foreign key (course_id, organization_id)
    references public.courses (id, organization_id) on delete cascade
);
create index lessons_module_idx on public.lessons (module_id);
create index lessons_course_idx on public.lessons (course_id);

create table public.content_blocks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  lesson_id uuid not null,
  block_type text not null check (block_type in (
    'rich_text', 'heading', 'callout', 'divider', 'image', 'video',
    'file_link', 'checklist', 'assessment_reference'
  )),
  schema_version integer not null check (schema_version >= 1),
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  position text not null check (char_length(position) between 1 and 40),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lesson_id, position) deferrable initially deferred,
  foreign key (lesson_id) references public.lessons (id) on delete cascade
);
create index content_blocks_lesson_idx on public.content_blocks (lesson_id);

-- ---------------------------------------------------------------------------
-- Immutable published snapshots
-- ---------------------------------------------------------------------------
create table public.lesson_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  lesson_id uuid not null references public.lessons (id) on delete restrict,
  course_id uuid not null,
  version_number integer not null check (version_number >= 1),
  title text not null,
  summary text,
  required boolean not null default true,
  estimated_minutes integer,
  blocks jsonb not null check (jsonb_typeof(blocks) = 'array'),
  published_by uuid not null,
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (lesson_id, version_number),
  unique (id, organization_id)
);
create index lesson_versions_lesson_idx on public.lesson_versions (lesson_id, version_number desc);
create index lesson_versions_course_idx on public.lesson_versions (course_id);

create table public.course_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  course_id uuid not null references public.courses (id) on delete restrict,
  version_number integer not null check (version_number >= 1),
  title text not null,
  summary text,
  structure jsonb not null check (jsonb_typeof(structure) = 'object'),
  completion_rule jsonb not null check (jsonb_typeof(completion_rule) = 'object'),
  supersedes_version_id uuid references public.course_versions (id),
  published_by uuid not null,
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (course_id, version_number),
  unique (id, organization_id)
);
create index course_versions_course_idx on public.course_versions (course_id, version_number desc);

alter table public.courses
  add constraint courses_current_published_version_fk
  foreign key (current_published_version_id) references public.course_versions (id);
alter table public.lessons
  add constraint lessons_current_published_version_fk
  foreign key (current_published_version_id) references public.lesson_versions (id);

-- Published snapshots are immutable: enforced by grants, absent policies,
-- AND this trigger (belt and suspenders — even definer code cannot slip).
create or replace function app.protect_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'published versions are immutable (%: %)', tg_table_name, tg_op
    using errcode = '42501';
end;
$$;

create trigger protect_immutable before update or delete on public.lesson_versions
  for each row execute function app.protect_immutable();
create trigger protect_immutable before update or delete on public.course_versions
  for each row execute function app.protect_immutable();

-- ---------------------------------------------------------------------------
-- Assessments — durable minimum (full engine is Phase 1D)
-- ---------------------------------------------------------------------------
create table public.assessments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  title text not null check (char_length(title) between 2 and 200),
  assessment_type text not null check (assessment_type in (
    'knowledge_check', 'quiz', 'exam', 'assignment', 'observation', 'manual_review'
  )),
  status text not null default 'draft' check (status in ('draft', 'archived')),
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  current_published_version_id uuid,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (id, organization_id)
);

create table public.assessment_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  assessment_id uuid not null references public.assessments (id) on delete restrict,
  version_number integer not null check (version_number >= 1),
  title text not null,
  settings jsonb not null default '{}'::jsonb,
  items jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array'),
  published_by uuid not null,
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (assessment_id, version_number)
);
alter table public.assessments
  add constraint assessments_current_published_version_fk
  foreign key (current_published_version_id) references public.assessment_versions (id);
create trigger protect_immutable before update or delete on public.assessment_versions
  for each row execute function app.protect_immutable();

-- ---------------------------------------------------------------------------
-- Enrollments (ADR-017: pin-at-enrollment for course targets)
-- ---------------------------------------------------------------------------
create table public.enrollments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  membership_id uuid not null,
  target_type text not null check (target_type in ('course', 'learning_path')),
  course_id uuid,
  learning_path_id uuid,
  pinned_course_version_id uuid references public.course_versions (id),
  status text not null default 'active'
    check (status in ('active', 'completed', 'withdrawn', 'expired')),
  source text not null check (source in ('assigned', 'self')),
  assigned_by uuid,
  started_at timestamptz,
  due_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((target_type = 'course') = (course_id is not null)),
  check ((target_type = 'learning_path') = (learning_path_id is not null)),
  -- course enrollments always pin the exact version at creation
  check (target_type <> 'course' or pinned_course_version_id is not null),
  unique (id, organization_id),
  foreign key (membership_id, organization_id)
    references public.organization_memberships (id, organization_id) on delete cascade,
  foreign key (course_id, organization_id)
    references public.courses (id, organization_id) on delete cascade,
  foreign key (learning_path_id, organization_id)
    references public.learning_paths (id, organization_id) on delete cascade
);
create unique index enrollments_one_live_course
  on public.enrollments (membership_id, course_id)
  where course_id is not null and status in ('active', 'completed');
create unique index enrollments_one_live_path
  on public.enrollments (membership_id, learning_path_id)
  where learning_path_id is not null and status in ('active', 'completed');
create index enrollments_org_idx on public.enrollments (organization_id, status);
create index enrollments_membership_idx on public.enrollments (membership_id);

-- ---------------------------------------------------------------------------
-- progress_records — evidence pinned to exact versions
-- ---------------------------------------------------------------------------
create table public.progress_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  enrollment_id uuid not null,
  subject_type text not null check (subject_type in ('course', 'lesson')),
  course_id uuid not null,
  lesson_id uuid,
  course_version_id uuid references public.course_versions (id),
  lesson_version_id uuid references public.lesson_versions (id),
  status text not null check (status in ('in_progress', 'completed', 'exempted')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  override_reason text check (override_reason is null or char_length(override_reason) <= 500),
  overridden_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((subject_type = 'lesson') = (lesson_id is not null)),
  -- evidence must pin exact versions
  check (subject_type <> 'course' or course_version_id is not null),
  check (subject_type <> 'lesson' or lesson_version_id is not null),
  check (status <> 'completed' or completed_at is not null),
  foreign key (enrollment_id, organization_id)
    references public.enrollments (id, organization_id) on delete cascade
);
create unique index progress_records_one_per_lesson
  on public.progress_records (enrollment_id, lesson_id)
  where lesson_id is not null;
create unique index progress_records_one_per_course
  on public.progress_records (enrollment_id, course_id)
  where subject_type = 'course';
create index progress_records_org_idx on public.progress_records (organization_id);
create index progress_records_enrollment_idx on public.progress_records (enrollment_id);

-- ---------------------------------------------------------------------------
-- Analytics events + transactional outbox
-- (ADR-018: plain indexed table now; partitioning deferred with playbook)
-- ---------------------------------------------------------------------------
create table public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  v integer not null default 1,
  type text not null check (type ~ '^[a-z_]+\.[a-z_]+\.[a-z_]+$'),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  occurred_at timestamptz not null default now(),
  received_at timestamptz not null default now(),
  actor_user_id uuid,
  subject_kind text not null check (char_length(subject_kind) <= 40),
  subject_id uuid not null,
  context jsonb not null default '{}'::jsonb check (jsonb_typeof(context) = 'object'),
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object'),
  correlation_id text check (correlation_id is null or char_length(correlation_id) <= 128),
  causation_id text check (causation_id is null or char_length(causation_id) <= 128),
  idempotency_key text not null unique
);
create index analytics_events_org_type_idx
  on public.analytics_events (organization_id, type, occurred_at desc);
create index analytics_events_subject_idx
  on public.analytics_events (organization_id, subject_kind, subject_id);

create table public.outbox_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  event_version integer not null default 1,
  organization_id uuid not null,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'processed', 'failed', 'dead_letter')),
  attempt_count integer not null default 0,
  available_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  last_error text
);
create index outbox_events_claim_idx on public.outbox_events (status, available_at);

comment on table public.outbox_events is
  'Transactional outbox (ADR-018). Written only inside the same transaction as the domain change, via app.emit_event. Platform-internal: tenants have no access. Worker deferred; processing contract in docs/architecture/transactional-outbox.md.';

-- ---------------------------------------------------------------------------
-- Shared triggers (updated_at + audit)
-- ---------------------------------------------------------------------------
create trigger set_updated_at before update on public.learning_systems
  for each row execute function app.set_updated_at();
create trigger set_updated_at before update on public.learning_paths
  for each row execute function app.set_updated_at();
create trigger set_updated_at before update on public.courses
  for each row execute function app.set_updated_at();
create trigger set_updated_at before update on public.modules
  for each row execute function app.set_updated_at();
create trigger set_updated_at before update on public.lessons
  for each row execute function app.set_updated_at();
create trigger set_updated_at before update on public.content_blocks
  for each row execute function app.set_updated_at();
create trigger set_updated_at before update on public.assessments
  for each row execute function app.set_updated_at();
create trigger set_updated_at before update on public.enrollments
  for each row execute function app.set_updated_at();
create trigger set_updated_at before update on public.progress_records
  for each row execute function app.set_updated_at();

create trigger audit_change after insert or update on public.learning_systems
  for each row execute function app.audit_change('learning_system');
create trigger audit_change after insert or update on public.learning_paths
  for each row execute function app.audit_change('learning_path');
create trigger audit_change after insert or delete on public.path_nodes
  for each row execute function app.audit_change('path_node');
create trigger audit_change after insert or delete on public.prerequisites
  for each row execute function app.audit_change('prerequisite');
create trigger audit_change after insert or update on public.courses
  for each row execute function app.audit_change('course');
create trigger audit_change after insert or update on public.modules
  for each row execute function app.audit_change('module');
create trigger audit_change after insert or update on public.lessons
  for each row execute function app.audit_change('lesson');
create trigger audit_change after insert on public.lesson_versions
  for each row execute function app.audit_change('lesson_version');
create trigger audit_change after insert on public.course_versions
  for each row execute function app.audit_change('course_version');
create trigger audit_change after insert or update on public.assessments
  for each row execute function app.audit_change('assessment');
create trigger audit_change after insert or update on public.enrollments
  for each row execute function app.audit_change('enrollment');
create trigger audit_change after insert or update on public.progress_records
  for each row execute function app.audit_change('progress_record');
-- content_blocks intentionally not audited row-by-row (draft keystroke noise);
-- the published lesson_version insert is the audited artifact.

-- ---------------------------------------------------------------------------
-- Access helper: published course content is visible to draft-viewers and to
-- learners whose enrollment covers the course (directly or via a path node).
-- ---------------------------------------------------------------------------
create or replace function app.can_access_course(p_organization_id uuid, p_course_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_org_permission(p_organization_id, 'content.view_draft')
  or exists (
    select 1
    from public.enrollments e
    join public.organization_memberships m on m.id = e.membership_id
    where m.user_id = (select auth.uid())
      and m.status = 'active'
      and e.organization_id = p_organization_id
      and e.status in ('active', 'completed')
      and (
        e.course_id = p_course_id
        or e.learning_path_id in (
          select pn.path_id from public.path_nodes pn where pn.course_id = p_course_id
        )
      )
  );
$$;

revoke all on function app.can_access_course(uuid, uuid) from public, anon;
grant execute on function app.can_access_course(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Grants hygiene + RLS
-- ---------------------------------------------------------------------------
revoke all on public.learning_systems, public.learning_paths, public.path_nodes,
  public.prerequisites, public.courses, public.modules, public.lessons,
  public.content_blocks, public.lesson_versions, public.course_versions,
  public.assessments, public.assessment_versions, public.enrollments,
  public.progress_records, public.analytics_events, public.outbox_events
from anon;

-- rpc-only / definer-only write paths lose direct write grants entirely
revoke insert, update, delete on public.lesson_versions from authenticated;
revoke insert, update, delete on public.course_versions from authenticated;
revoke insert, update, delete on public.assessment_versions from authenticated;
revoke insert, update, delete on public.enrollments from authenticated;
revoke insert, update, delete on public.progress_records from authenticated;
revoke insert, update, delete on public.analytics_events from authenticated;
revoke all on public.outbox_events from authenticated;

alter table public.learning_systems enable row level security;
alter table public.learning_paths enable row level security;
alter table public.path_nodes enable row level security;
alter table public.prerequisites enable row level security;
alter table public.courses enable row level security;
alter table public.modules enable row level security;
alter table public.lessons enable row level security;
alter table public.content_blocks enable row level security;
alter table public.lesson_versions enable row level security;
alter table public.course_versions enable row level security;
alter table public.assessments enable row level security;
alter table public.assessment_versions enable row level security;
alter table public.enrollments enable row level security;
alter table public.progress_records enable row level security;
alter table public.analytics_events enable row level security;
alter table public.outbox_events enable row level security;

-- learning_systems / learning_paths: members see active; draft-viewers see all
create policy learning_systems_select on public.learning_systems
  for select to authenticated
  using (app.is_org_member(organization_id) and (
    status = 'active' or app.has_org_permission(organization_id, 'content.view_draft')
  ));
create policy learning_systems_write on public.learning_systems
  for insert to authenticated
  with check (app.has_org_permission(organization_id, 'paths.manage'));
create policy learning_systems_update on public.learning_systems
  for update to authenticated
  using (app.has_org_permission(organization_id, 'paths.manage'))
  with check (app.has_org_permission(organization_id, 'paths.manage'));

create policy learning_paths_select on public.learning_paths
  for select to authenticated
  using (app.is_org_member(organization_id) and (
    status = 'active' or app.has_org_permission(organization_id, 'content.view_draft')
  ));
create policy learning_paths_write on public.learning_paths
  for insert to authenticated
  with check (app.has_org_permission(organization_id, 'paths.manage'));
create policy learning_paths_update on public.learning_paths
  for update to authenticated
  using (app.has_org_permission(organization_id, 'paths.manage'))
  with check (app.has_org_permission(organization_id, 'paths.manage'));

create policy path_nodes_select on public.path_nodes
  for select to authenticated
  using (
    app.is_org_member(organization_id)
    and exists (
      select 1 from public.learning_paths p
      where p.id = path_id
        and (p.status = 'active' or app.has_org_permission(p.organization_id, 'content.view_draft'))
    )
  );
create policy path_nodes_insert on public.path_nodes
  for insert to authenticated
  with check (app.has_org_permission(organization_id, 'paths.manage'));
create policy path_nodes_delete on public.path_nodes
  for delete to authenticated
  using (app.has_org_permission(organization_id, 'paths.manage'));

create policy prerequisites_select on public.prerequisites
  for select to authenticated
  using (
    app.is_org_member(organization_id)
    and exists (
      select 1 from public.learning_paths p
      where p.id = path_id
        and (p.status = 'active' or app.has_org_permission(p.organization_id, 'content.view_draft'))
    )
  );
create policy prerequisites_insert on public.prerequisites
  for insert to authenticated
  with check (app.has_org_permission(organization_id, 'paths.manage'));
create policy prerequisites_delete on public.prerequisites
  for delete to authenticated
  using (app.has_org_permission(organization_id, 'paths.manage'));

-- Draft content: authoring-side only. Learners read published versions.
create policy courses_select on public.courses
  for select to authenticated
  using (app.can_access_course(organization_id, id));
create policy courses_insert on public.courses
  for insert to authenticated
  with check (app.has_org_permission(organization_id, 'content.author'));
create policy courses_update on public.courses
  for update to authenticated
  using (app.has_org_permission(organization_id, 'content.author'))
  with check (app.has_org_permission(organization_id, 'content.author'));

create policy modules_select on public.modules
  for select to authenticated
  using (app.has_org_permission(organization_id, 'content.view_draft'));
create policy modules_insert on public.modules
  for insert to authenticated
  with check (app.has_org_permission(organization_id, 'content.author'));
create policy modules_update on public.modules
  for update to authenticated
  using (app.has_org_permission(organization_id, 'content.author'))
  with check (app.has_org_permission(organization_id, 'content.author'));

create policy lessons_select on public.lessons
  for select to authenticated
  using (app.has_org_permission(organization_id, 'content.view_draft'));
create policy lessons_insert on public.lessons
  for insert to authenticated
  with check (app.has_org_permission(organization_id, 'content.author'));
create policy lessons_update on public.lessons
  for update to authenticated
  using (app.has_org_permission(organization_id, 'content.author'))
  with check (app.has_org_permission(organization_id, 'content.author'));

create policy content_blocks_select on public.content_blocks
  for select to authenticated
  using (app.has_org_permission(organization_id, 'content.view_draft'));
create policy content_blocks_insert on public.content_blocks
  for insert to authenticated
  with check (app.has_org_permission(organization_id, 'content.author'));
create policy content_blocks_update on public.content_blocks
  for update to authenticated
  using (app.has_org_permission(organization_id, 'content.author'))
  with check (app.has_org_permission(organization_id, 'content.author'));
create policy content_blocks_delete on public.content_blocks
  for delete to authenticated
  using (app.has_org_permission(organization_id, 'content.author'));

-- Published versions: strict — draft-viewers OR covered by an enrollment.
create policy lesson_versions_select on public.lesson_versions
  for select to authenticated
  using (app.can_access_course(organization_id, course_id));
create policy course_versions_select on public.course_versions
  for select to authenticated
  using (app.can_access_course(organization_id, course_id));

create policy assessments_select on public.assessments
  for select to authenticated
  using (app.has_org_permission(organization_id, 'content.view_draft'));
create policy assessments_insert on public.assessments
  for insert to authenticated
  with check (app.has_org_permission(organization_id, 'assessment.author'));
create policy assessments_update on public.assessments
  for update to authenticated
  using (app.has_org_permission(organization_id, 'assessment.author'))
  with check (app.has_org_permission(organization_id, 'assessment.author'));
create policy assessment_versions_select on public.assessment_versions
  for select to authenticated
  using (app.has_org_permission(organization_id, 'content.view_draft'));

-- Enrollments/progress: own rows or progress-viewers; writes via RPCs only.
create policy enrollments_select on public.enrollments
  for select to authenticated
  using (
    app.has_org_permission(organization_id, 'enrollment.manage')
    or app.has_org_permission(organization_id, 'progress.view.others')
    or exists (
      select 1 from public.organization_memberships m
      where m.id = membership_id and m.user_id = (select auth.uid())
    )
  );

create policy progress_records_select on public.progress_records
  for select to authenticated
  using (
    app.has_org_permission(organization_id, 'progress.view.others')
    or exists (
      select 1
      from public.enrollments e
      join public.organization_memberships m on m.id = e.membership_id
      where e.id = enrollment_id and m.user_id = (select auth.uid())
    )
  );

create policy analytics_events_select on public.analytics_events
  for select to authenticated
  using (app.has_org_permission(organization_id, 'analytics.view'));

-- outbox_events: NO policies for authenticated/anon — platform-internal only.
