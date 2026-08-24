-- =============================================================================
-- CURRICULUM RECORDS
-- Structured reference records that a governed curriculum carries alongside its
-- teachable content: competencies, doctrine, applied standards, judgment
-- boundaries, claim audits, evidence classifications, cases, references, and
-- governance/series metadata (versions, authority rules, taxonomies,
-- completion rules, workload). One row per record, scoped to exactly one
-- course OR one learning path, keyed by the curriculum's own stable code.
--
-- These are records, not behavior: nothing in the platform derives a decision
-- from them. They exist so competency linkage, evidence classes, and source
-- mapping are queryable and auditable rather than buried in prose.
-- Payload shapes are governed in the domain package per kind; SQL requires a
-- JSON object (the content_blocks.data precedent).
-- =============================================================================

create table public.curriculum_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  course_id uuid references public.courses (id) on delete cascade,
  learning_path_id uuid references public.learning_paths (id) on delete cascade,
  kind text not null check (kind in (
    'competency', 'doctrine', 'applied_standard', 'coach_judgment',
    'claim_audit', 'evidence_classification', 'case', 'reference',
    'governance', 'series'
  )),
  code text not null check (char_length(code) between 1 and 80),
  title text not null check (char_length(title) between 1 and 300),
  data jsonb not null default '{}' check (jsonb_typeof(data) = 'object'),
  position text not null default 'a0' check (char_length(position) between 1 and 40),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((course_id is null) <> (learning_path_id is null))
);

create unique index curriculum_records_scope_kind_code
  on public.curriculum_records
     (organization_id, coalesce(course_id, learning_path_id), kind, code);
create index curriculum_records_course_idx
  on public.curriculum_records (course_id, kind, position);
create index curriculum_records_path_idx
  on public.curriculum_records (learning_path_id, kind, position);

create trigger set_updated_at
  before update on public.curriculum_records
  for each row execute function app.set_updated_at();

create trigger audit_change
  after insert or update or delete on public.curriculum_records
  for each row execute function app.audit_change('curriculum_record');

alter table public.curriculum_records enable row level security;

-- Reference material: readable by any active member of the organization.
create policy curriculum_records_select on public.curriculum_records
  for select to authenticated
  using (app.is_org_member(organization_id));

-- Writes arrive through governed seeds/migrations only (no client write path).
revoke insert, update, delete on public.curriculum_records from authenticated;
revoke all on public.curriculum_records from anon;
