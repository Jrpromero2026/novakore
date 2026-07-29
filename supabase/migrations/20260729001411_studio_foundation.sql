-- NovaKore Phase 2 — Learning Studio foundation.
-- Reusable content library, source documents, governed AI ledger + budgets,
-- review workflow, path canvas layouts, webhook endpoints/deliveries,
-- assessment submission file metadata, expanded block-type catalog, three
-- new permissions, and the Studio/AI RPCs. Additive only.

-- ---------------------------------------------------------------------------
-- 1. Permissions (29 → 32) + bundles + backfill + seed-function revision
--    (same-migration rule; the future-org parity test enforces the owner
--    bundle stays complete).
-- ---------------------------------------------------------------------------
insert into public.permissions (code, description, category) values
  ('library.manage', 'Create, update, and archive reusable content blocks', 'library'),
  ('sources.manage', 'Manage AI source documents', 'library'),
  ('ai.budget.manage', 'Configure the organization AI budget (platform-capped)', 'ai')
on conflict (code) do nothing;

do $$
begin
  perform pg_catalog.set_config('app.system_role_maintenance', 'true', true);
  insert into public.organization_role_permissions (organization_id, role_id, permission_code)
  select r.organization_id, r.id, p.code
  from public.organization_roles r
  cross join (values
    ('organization_owner', 'library.manage'),
    ('organization_owner', 'sources.manage'),
    ('organization_owner', 'ai.budget.manage'),
    ('organization_admin', 'library.manage'),
    ('organization_admin', 'sources.manage'),
    ('organization_admin', 'ai.budget.manage'),
    ('academy_admin', 'library.manage'),
    ('academy_admin', 'sources.manage'),
    ('author', 'library.manage'),
    ('author', 'sources.manage')
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
        array['org.manage','org.members.manage','org.roles.manage','org.branding.manage','org.branding.publish','org.terminology.manage','academy.manage','content.view_draft','content.author','content.publish','content.archive','paths.manage','assessment.author','assessment.publish','assessment.assign','assessment.grade','assessment.override','enrollment.manage','enrollment.self','progress.view.own','progress.view.others','progress.override','certificates.manage','credential.issue','credential.revoke','library.manage','sources.manage','ai.budget.manage','analytics.view','audit.view','integrations.manage','ai.author.use']),
      ('organization_admin', 'Organization Admin',
        'Administers the organization on the owner''s behalf.',
        array['org.manage','org.members.manage','org.roles.manage','org.branding.manage','org.branding.publish','org.terminology.manage','academy.manage','content.view_draft','content.author','content.publish','content.archive','paths.manage','assessment.author','assessment.publish','assessment.assign','assessment.grade','assessment.override','enrollment.manage','enrollment.self','progress.view.own','progress.view.others','progress.override','certificates.manage','credential.issue','credential.revoke','library.manage','sources.manage','ai.budget.manage','analytics.view','audit.view','integrations.manage','ai.author.use']),
      ('academy_admin', 'Academy Admin',
        'Administers assigned academies.',
        array['academy.manage','content.view_draft','content.author','content.publish','content.archive','paths.manage','assessment.author','assessment.publish','assessment.assign','assessment.grade','enrollment.manage','enrollment.self','progress.view.own','progress.view.others','library.manage','sources.manage','analytics.view','ai.author.use']),
      ('author', 'Author',
        'Creates and edits draft content. Publishing requires a separate role.',
        array['content.view_draft','content.author','paths.manage','assessment.author','enrollment.self','progress.view.own','library.manage','sources.manage','ai.author.use']),
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
-- 2. Expanded block-type catalog on draft content blocks (Phase 2 set;
--    published snapshots are unaffected — renderers already fall back).
-- ---------------------------------------------------------------------------
alter table public.content_blocks drop constraint content_blocks_block_type_check;
alter table public.content_blocks
  add constraint content_blocks_block_type_check
  check (block_type in (
    'rich_text','heading','callout','divider','image','video','file_link',
    'checklist','assessment_reference',
    'quote','accordion','tabs','timeline','comparison','flashcards',
    'knowledge_check','reflection','action_step','scenario','audio','pdf',
    'survey','branching_scenario','decision_tree','ai_conversation',
    'ai_roleplay','manager_approval','instructor_feedback','live_session',
    'diagram'
  ));

-- Link-to-source for reusable blocks (null = local/original content).
alter table public.content_blocks
  add column source_reusable_block_id uuid;

-- ---------------------------------------------------------------------------
-- 3. reusable_blocks — the organization content library
-- ---------------------------------------------------------------------------
create table public.reusable_blocks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  -- null academy = shared org-wide; set = scoped to that academy
  academy_id uuid,
  title text not null check (char_length(title) between 2 and 200),
  description text check (description is null or char_length(description) <= 1000),
  block_type text not null,
  schema_version integer not null check (schema_version >= 1),
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  tags text[] not null default '{}' check (array_length(tags, 1) is null or array_length(tags, 1) <= 10),
  version integer not null default 1 check (version >= 1),
  status text not null default 'active' check (status in ('active', 'archived')),
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (id, organization_id),
  foreign key (academy_id, organization_id)
    references public.academies (id, organization_id)
);
create index reusable_blocks_org_idx on public.reusable_blocks (organization_id, status);
create index reusable_blocks_tags_idx on public.reusable_blocks using gin (tags);

alter table public.content_blocks
  add constraint content_blocks_source_reusable_fk
  foreign key (source_reusable_block_id) references public.reusable_blocks (id)
  on delete set null;
create index content_blocks_source_reusable_idx
  on public.content_blocks (source_reusable_block_id)
  where source_reusable_block_id is not null;

-- content version bumps on data changes (controlled versioning)
create or replace function app.bump_reusable_block_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.data is distinct from old.data
     or new.schema_version is distinct from old.schema_version then
    new.version := old.version + 1;
  end if;
  return new;
end;
$$;
create trigger bump_reusable_block_version before update on public.reusable_blocks
  for each row execute function app.bump_reusable_block_version();

-- ---------------------------------------------------------------------------
-- 4. source_documents — governed AI source material
-- ---------------------------------------------------------------------------
create table public.source_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  title text not null check (char_length(title) between 2 and 200),
  kind text not null check (kind in ('text', 'markdown', 'file')),
  -- inline content for text/markdown; files live in the source-documents bucket
  content text check (content is null or char_length(content) <= 100000),
  storage_path text check (storage_path is null or char_length(storage_path) <= 500),
  content_hash text check (content_hash is null or content_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'ready' check (status in ('pending', 'ready', 'archived')),
  review_state text not null default 'unreviewed' check (review_state in ('unreviewed', 'approved')),
  extraction_status text not null default 'not_needed'
    check (extraction_status in ('not_needed', 'pending', 'extracted', 'failed')),
  provenance text check (provenance is null or char_length(provenance) <= 500),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  check ((kind = 'file') = (storage_path is not null)),
  check (kind = 'file' or content is not null),
  unique (id, organization_id)
);
create index source_documents_org_idx on public.source_documents (organization_id, status);

-- ---------------------------------------------------------------------------
-- 5. AI budgets + generation ledger (integer cents; calendar-month window)
-- ---------------------------------------------------------------------------
create table public.ai_budgets (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  -- platform development cap: 5000 cents ($50/month, owner-approved)
  monthly_limit_cents integer not null default 5000
    check (monthly_limit_cents between 0 and 5000),
  updated_by uuid,
  updated_at timestamptz not null default now()
);

create table public.ai_generations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  requested_by uuid not null,
  operation text not null,
  model_profile text not null check (model_profile in ('drafting', 'structured', 'rewrite')),
  provider text not null,
  provider_model text,
  prompt_version integer not null default 1,
  objective text not null check (char_length(objective) between 1 and 2000),
  audience text check (audience is null or char_length(audience) <= 300),
  reading_level text check (reading_level is null or reading_level in ('introductory', 'intermediate', 'advanced')),
  source_document_ids uuid[] not null default '{}',
  status text not null default 'reserved'
    check (status in ('reserved', 'completed', 'failed', 'accepted', 'rejected')),
  reserved_cents integer not null check (reserved_cents >= 0),
  actual_cents integer check (actual_cents is null or actual_cents >= 0),
  input_tokens integer check (input_tokens is null or input_tokens >= 0),
  output_tokens integer check (output_tokens is null or output_tokens >= 0),
  output jsonb,
  error text check (error is null or char_length(error) <= 500),
  month_key text not null check (month_key ~ '^\d{4}-\d{2}$'),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (id, organization_id)
);
create index ai_generations_org_month_idx on public.ai_generations (organization_id, month_key, status);
create index ai_generations_requested_by_idx on public.ai_generations (requested_by);

-- ---------------------------------------------------------------------------
-- 6. Review workflow (collaboration foundations)
-- ---------------------------------------------------------------------------
create table public.review_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  subject_type text not null check (subject_type in ('lesson', 'course', 'assessment')),
  subject_id uuid not null,
  status text not null default 'open'
    check (status in ('open', 'approved', 'changes_requested', 'closed')),
  note text check (note is null or char_length(note) <= 2000),
  requested_by uuid not null,
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (organization_id) references public.organizations (id) on delete cascade
);
-- one open request per subject
create unique index review_requests_one_open
  on public.review_requests (subject_type, subject_id)
  where status in ('open', 'changes_requested');
create index review_requests_org_idx on public.review_requests (organization_id, status);

create table public.review_comments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  request_id uuid not null,
  author_id uuid not null,
  body text not null check (char_length(body) between 1 and 4000),
  status text not null default 'open' check (status in ('open', 'resolved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (request_id, organization_id)
    references public.review_requests (id, organization_id) on delete cascade
);
create index review_comments_request_idx on public.review_comments (request_id);

-- ---------------------------------------------------------------------------
-- 7. path_layouts — canvas presentation, separate from semantic order
-- ---------------------------------------------------------------------------
create table public.path_layouts (
  path_id uuid primary key,
  organization_id uuid not null,
  layout jsonb not null check (jsonb_typeof(layout) = 'object'),
  updated_by uuid,
  updated_at timestamptz not null default now(),
  foreign key (path_id, organization_id)
    references public.learning_paths (id, organization_id) on delete cascade
);

-- ---------------------------------------------------------------------------
-- 8. Webhook endpoints + deliveries (worker lands in the companion function)
-- ---------------------------------------------------------------------------
create table public.webhook_endpoints (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  url text not null check (char_length(url) <= 1000),
  -- shared secret for HMAC signing; visible only to integrations.manage
  secret text not null check (char_length(secret) between 16 and 128),
  event_types text[] not null default '{}',
  status text not null default 'active' check (status in ('active', 'paused', 'revoked')),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id)
);
create index webhook_endpoints_org_idx on public.webhook_endpoints (organization_id, status);

create table public.webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  endpoint_id uuid not null,
  outbox_event_id uuid not null references public.outbox_events (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'delivering', 'delivered', 'failed', 'dead_letter')),
  attempt_count integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  response_status integer,
  response_excerpt text check (response_excerpt is null or char_length(response_excerpt) <= 4096),
  last_error text check (last_error is null or char_length(last_error) <= 500),
  correlation_id text,
  causation_id text,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (endpoint_id, outbox_event_id),
  foreign key (endpoint_id, organization_id)
    references public.webhook_endpoints (id, organization_id) on delete cascade
);
create index webhook_deliveries_claim_idx on public.webhook_deliveries (status, next_attempt_at);
create index webhook_deliveries_org_idx on public.webhook_deliveries (organization_id, status);

-- ---------------------------------------------------------------------------
-- 9. Assessment submission file metadata (bucket lands with storage config;
--    the item type keeps its guarded state until then)
-- ---------------------------------------------------------------------------
create table public.assessment_submission_files (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  attempt_id uuid not null,
  response_id uuid,
  item_id uuid not null,
  membership_id uuid not null,
  storage_path text not null check (char_length(storage_path) <= 500),
  file_name text not null check (char_length(file_name) between 1 and 200),
  mime_type text not null check (mime_type in ('application/pdf', 'image/png', 'image/jpeg', 'text/plain')),
  byte_size integer not null check (byte_size between 1 and 50000000),
  status text not null default 'pending' check (status in ('pending', 'active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (attempt_id, organization_id)
    references public.assessment_attempts (id, organization_id) on delete cascade,
  foreign key (membership_id, organization_id)
    references public.organization_memberships (id, organization_id)
);
create index assessment_submission_files_attempt_idx
  on public.assessment_submission_files (attempt_id);

-- ---------------------------------------------------------------------------
-- 10. Shared triggers
-- ---------------------------------------------------------------------------
create trigger set_updated_at before update on public.reusable_blocks
  for each row execute function app.set_updated_at();
create trigger set_updated_at before update on public.source_documents
  for each row execute function app.set_updated_at();
create trigger set_updated_at before update on public.review_requests
  for each row execute function app.set_updated_at();
create trigger set_updated_at before update on public.review_comments
  for each row execute function app.set_updated_at();
create trigger set_updated_at before update on public.webhook_endpoints
  for each row execute function app.set_updated_at();
create trigger set_updated_at before update on public.webhook_deliveries
  for each row execute function app.set_updated_at();
create trigger set_updated_at before update on public.assessment_submission_files
  for each row execute function app.set_updated_at();

create trigger audit_change after insert or update on public.reusable_blocks
  for each row execute function app.audit_change('reusable_block');
create trigger audit_change after insert or update on public.source_documents
  for each row execute function app.audit_change('source_document');
create trigger audit_change after insert or update on public.review_requests
  for each row execute function app.audit_change('review_request');
create trigger audit_change after insert or update on public.webhook_endpoints
  for each row execute function app.audit_change('webhook_endpoint');
create trigger audit_change after insert or update on public.ai_budgets
  for each row execute function app.audit_change('ai_budget');

-- ---------------------------------------------------------------------------
-- 11. Grants + RLS
-- ---------------------------------------------------------------------------
revoke all on public.reusable_blocks, public.source_documents, public.ai_budgets,
  public.ai_generations, public.review_requests, public.review_comments,
  public.path_layouts, public.webhook_endpoints, public.webhook_deliveries,
  public.assessment_submission_files
from anon;

-- ledger + deliveries + submission metadata + review requests are
-- RPC/worker-written
revoke insert, update, delete on public.ai_generations from authenticated;
revoke insert, update, delete on public.webhook_deliveries from authenticated;
revoke insert, update, delete on public.assessment_submission_files from authenticated;
revoke insert, update, delete on public.review_requests from authenticated;

alter table public.reusable_blocks enable row level security;
alter table public.source_documents enable row level security;
alter table public.ai_budgets enable row level security;
alter table public.ai_generations enable row level security;
alter table public.review_requests enable row level security;
alter table public.review_comments enable row level security;
alter table public.path_layouts enable row level security;
alter table public.webhook_endpoints enable row level security;
alter table public.webhook_deliveries enable row level security;
alter table public.assessment_submission_files enable row level security;

-- Library: draft-visible staff read; library.manage writes.
create policy reusable_blocks_select on public.reusable_blocks
  for select to authenticated
  using (app.has_org_permission(organization_id, 'content.view_draft'));
create policy reusable_blocks_insert on public.reusable_blocks
  for insert to authenticated
  with check (app.has_org_permission(organization_id, 'library.manage'));
create policy reusable_blocks_update on public.reusable_blocks
  for update to authenticated
  using (app.has_org_permission(organization_id, 'library.manage'))
  with check (app.has_org_permission(organization_id, 'library.manage'));

-- Sources: sources.manage writes; draft staff read.
create policy source_documents_select on public.source_documents
  for select to authenticated
  using (app.has_org_permission(organization_id, 'content.view_draft'));
create policy source_documents_insert on public.source_documents
  for insert to authenticated
  with check (app.has_org_permission(organization_id, 'sources.manage'));
create policy source_documents_update on public.source_documents
  for update to authenticated
  using (app.has_org_permission(organization_id, 'sources.manage'))
  with check (app.has_org_permission(organization_id, 'sources.manage'));

-- Budgets: visible to budget managers + analytics viewers; writes via RPC-less
-- direct update guarded by ai.budget.manage (platform cap is the CHECK).
create policy ai_budgets_select on public.ai_budgets
  for select to authenticated
  using (
    app.has_org_permission(organization_id, 'ai.budget.manage')
    or app.has_org_permission(organization_id, 'analytics.view')
  );
create policy ai_budgets_insert on public.ai_budgets
  for insert to authenticated
  with check (app.has_org_permission(organization_id, 'ai.budget.manage'));
create policy ai_budgets_update on public.ai_budgets
  for update to authenticated
  using (app.has_org_permission(organization_id, 'ai.budget.manage'))
  with check (app.has_org_permission(organization_id, 'ai.budget.manage'));

-- Ledger: requester sees own; usage visibility via analytics.view.
create policy ai_generations_select on public.ai_generations
  for select to authenticated
  using (
    requested_by = (select auth.uid())
    or app.has_org_permission(organization_id, 'analytics.view')
  );

-- Review: draft staff read; authors request; deciders act via RPC.
create policy review_requests_select on public.review_requests
  for select to authenticated
  using (app.has_org_permission(organization_id, 'content.view_draft'));
create policy review_comments_select on public.review_comments
  for select to authenticated
  using (app.has_org_permission(organization_id, 'content.view_draft'));
create policy review_comments_insert on public.review_comments
  for insert to authenticated
  with check (
    app.has_org_permission(organization_id, 'content.view_draft')
    and author_id = (select auth.uid())
  );
create policy review_comments_update on public.review_comments
  for update to authenticated
  using (app.has_org_permission(organization_id, 'content.view_draft'))
  with check (app.has_org_permission(organization_id, 'content.view_draft'));

-- Layouts: paths.manage.
create policy path_layouts_select on public.path_layouts
  for select to authenticated
  using (app.has_org_permission(organization_id, 'content.view_draft'));
create policy path_layouts_insert on public.path_layouts
  for insert to authenticated
  with check (app.has_org_permission(organization_id, 'paths.manage'));
create policy path_layouts_update on public.path_layouts
  for update to authenticated
  using (app.has_org_permission(organization_id, 'paths.manage'))
  with check (app.has_org_permission(organization_id, 'paths.manage'));

-- Webhooks: integrations.manage end to end (secrets included — documented).
create policy webhook_endpoints_all_select on public.webhook_endpoints
  for select to authenticated
  using (app.has_org_permission(organization_id, 'integrations.manage'));
create policy webhook_endpoints_insert on public.webhook_endpoints
  for insert to authenticated
  with check (app.has_org_permission(organization_id, 'integrations.manage'));
create policy webhook_endpoints_update on public.webhook_endpoints
  for update to authenticated
  using (app.has_org_permission(organization_id, 'integrations.manage'))
  with check (app.has_org_permission(organization_id, 'integrations.manage'));

create policy webhook_deliveries_select on public.webhook_deliveries
  for select to authenticated
  using (app.has_org_permission(organization_id, 'integrations.manage'));

-- Submission files: owner (uploader) or graders.
create policy assessment_submission_files_select on public.assessment_submission_files
  for select to authenticated
  using (
    app.has_org_permission(organization_id, 'assessment.grade')
    or exists (
      select 1 from public.organization_memberships m
      where m.id = membership_id and m.user_id = (select auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- 12. Studio event emission (allowlisted app-level analytics)
-- ---------------------------------------------------------------------------
create or replace function public.emit_studio_event(
  p_organization_id uuid,
  p_type text,
  p_subject_kind text,
  p_subject_id uuid,
  p_context jsonb default '{}'::jsonb,
  p_data jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not app.is_org_member(p_organization_id) then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  if p_type not in (
    'studio.session.opened', 'content.learning_path.created',
    'content.path_node.added', 'content.lesson.previewed',
    'library.block.created', 'library.block.used',
    'media.asset.uploaded', 'content.source_document.created'
  ) then
    raise exception 'event type % is not app-emittable', p_type using errcode = '22000';
  end if;
  perform app.emit_event(
    p_organization_id, p_type, p_subject_kind, p_subject_id,
    coalesce(p_context, '{}'::jsonb), coalesce(p_data, '{}'::jsonb),
    p_type || ':' || p_subject_id::text || ':' ||
      floor(extract(epoch from clock_timestamp()))::text
  );
end;
$$;
revoke all on function public.emit_studio_event(uuid, text, text, uuid, jsonb, jsonb) from public, anon;
grant execute on function public.emit_studio_event(uuid, text, text, uuid, jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 13. AI ledger RPCs — reservation in SQL, hard stop, no silent overage
-- ---------------------------------------------------------------------------
create or replace function app.ai_reservation_cents(p_profile text)
returns integer
language sql
immutable
set search_path = ''
as $$
  -- mirrors the domain reservation math (documented estimates)
  select case p_profile
    when 'rewrite' then greatest(1, ceil(4000 * 80 / 1000000.0)::int + ceil(2000 * 400 / 1000000.0)::int)
    else greatest(1, ceil(8000 * 300 / 1000000.0)::int + ceil(4000 * 1500 / 1000000.0)::int)
  end;
$$;

create or replace function public.reserve_ai_generation(
  p_organization_id uuid,
  p_operation text,
  p_model_profile text,
  p_provider text,
  p_objective text,
  p_audience text default null,
  p_reading_level text default null,
  p_source_document_ids uuid[] default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer;
  v_used integer;
  v_reserve integer;
  v_month text;
  v_id uuid;
begin
  if not app.has_org_permission(p_organization_id, 'ai.author.use') then
    raise exception 'permission denied: generating requires ai.author.use' using errcode = '42501';
  end if;
  if p_model_profile not in ('drafting', 'structured', 'rewrite') then
    raise exception 'invalid model profile' using errcode = '22000';
  end if;
  -- every referenced source must belong to this organization
  if exists (
    select 1 from unnest(p_source_document_ids) sid
    where not exists (
      select 1 from public.source_documents sd
      where sd.id = sid and sd.organization_id = p_organization_id
        and sd.status = 'ready'
    )
  ) then
    raise exception 'source documents must belong to this organization' using errcode = '42501';
  end if;

  v_month := to_char(now() at time zone 'UTC', 'YYYY-MM');
  v_reserve := app.ai_reservation_cents(p_model_profile);
  -- platform cap 5000; org limit may be lower
  select least(coalesce(
    (select monthly_limit_cents from public.ai_budgets where organization_id = p_organization_id),
    5000), 5000)
    into v_limit;

  -- serialize concurrent reservations per org
  perform pg_advisory_xact_lock(hashtext('ai-budget:' || p_organization_id::text));

  select coalesce(sum(
           case when status in ('completed', 'accepted', 'rejected')
                then coalesce(actual_cents, reserved_cents)
                when status = 'reserved' then reserved_cents
                else 0 end), 0)
    into v_used
    from public.ai_generations
   where organization_id = p_organization_id and month_key = v_month;

  if v_used + v_reserve > v_limit then
    raise exception 'AI budget exceeded: % of % cents used this month', v_used, v_limit
      using errcode = 'P0001';
  end if;

  insert into public.ai_generations
    (organization_id, requested_by, operation, model_profile, provider,
     objective, audience, reading_level, source_document_ids,
     reserved_cents, month_key)
  values
    (p_organization_id, (select auth.uid()), p_operation, p_model_profile,
     p_provider, p_objective, p_audience, p_reading_level,
     coalesce(p_source_document_ids, '{}'), v_reserve, v_month)
  returning id into v_id;

  perform app.emit_event(
    p_organization_id, 'ai.generation.requested', 'ai_generation', v_id,
    jsonb_build_object('operation', p_operation, 'model_profile', p_model_profile),
    jsonb_build_object('reserved_cents', v_reserve),
    'ai-requested:' || v_id::text
  );
  return v_id;
end;
$$;

create or replace function public.settle_ai_generation(
  p_generation_id uuid,
  p_success boolean,
  p_output jsonb default null,
  p_provider_model text default null,
  p_input_tokens integer default null,
  p_output_tokens integer default null,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row record;
  v_cost integer;
begin
  select * into v_row from public.ai_generations where id = p_generation_id for update;
  if v_row.id is null then
    raise exception 'generation not found' using errcode = 'P0002';
  end if;
  if v_row.requested_by is distinct from (select auth.uid()) then
    raise exception 'only the requester can settle a generation' using errcode = '42501';
  end if;
  if v_row.status <> 'reserved' then
    return; -- idempotent
  end if;

  if p_success then
    -- cost computed in SQL from token counts (estimates; provider invoices
    -- are the production reconciliation authority — documented)
    v_cost := greatest(1,
      case v_row.model_profile
        when 'rewrite' then
          ceil(coalesce(p_input_tokens, 0) * 80 / 1000000.0)::int +
          ceil(coalesce(p_output_tokens, 0) * 400 / 1000000.0)::int
        else
          ceil(coalesce(p_input_tokens, 0) * 300 / 1000000.0)::int +
          ceil(coalesce(p_output_tokens, 0) * 1500 / 1000000.0)::int
      end);
    update public.ai_generations
       set status = 'completed', output = p_output,
           provider_model = p_provider_model,
           input_tokens = p_input_tokens, output_tokens = p_output_tokens,
           actual_cents = v_cost, completed_at = now()
     where id = p_generation_id;
    perform app.emit_event(
      v_row.organization_id, 'ai.generation.completed', 'ai_generation', p_generation_id,
      jsonb_build_object('operation', v_row.operation),
      jsonb_build_object('actual_cents', v_cost),
      'ai-completed:' || p_generation_id::text
    );
  else
    update public.ai_generations
       set status = 'failed', error = left(coalesce(p_error, 'generation failed'), 500),
           completed_at = now(), actual_cents = 0
     where id = p_generation_id;
    perform app.emit_event(
      v_row.organization_id, 'ai.generation.failed', 'ai_generation', p_generation_id,
      jsonb_build_object('operation', v_row.operation), '{}'::jsonb,
      'ai-failed:' || p_generation_id::text
    );
  end if;
end;
$$;

create or replace function public.resolve_ai_generation(
  p_generation_id uuid,
  p_accepted boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row record;
begin
  select * into v_row from public.ai_generations where id = p_generation_id for update;
  if v_row.id is null then
    raise exception 'generation not found' using errcode = 'P0002';
  end if;
  if v_row.requested_by is distinct from (select auth.uid())
     and not app.has_org_permission(v_row.organization_id, 'content.author') then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  if v_row.status <> 'completed' then
    return;
  end if;
  update public.ai_generations
     set status = case when p_accepted then 'accepted' else 'rejected' end
   where id = p_generation_id;
  perform app.emit_event(
    v_row.organization_id,
    case when p_accepted then 'ai.generation.accepted' else 'ai.generation.rejected' end,
    'ai_generation', p_generation_id,
    jsonb_build_object('operation', v_row.operation), '{}'::jsonb,
    'ai-resolved:' || p_generation_id::text
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 14. Review RPCs (no self-approval)
-- ---------------------------------------------------------------------------
create or replace function public.request_review(
  p_organization_id uuid,
  p_subject_type text,
  p_subject_id uuid,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_subject_type not in ('lesson', 'course', 'assessment') then
    raise exception 'invalid review subject' using errcode = '22000';
  end if;
  if not app.has_org_permission(p_organization_id, 'content.author')
     and not app.has_org_permission(p_organization_id, 'assessment.author') then
    raise exception 'permission denied: requesting review requires authoring access' using errcode = '42501';
  end if;
  -- reopen a changes_requested cycle or create a fresh request
  update public.review_requests
     set status = 'open', note = coalesce(p_note, note),
         requested_by = (select auth.uid()), decided_by = null, decided_at = null
   where organization_id = p_organization_id
     and subject_type = p_subject_type and subject_id = p_subject_id
     and status = 'changes_requested'
  returning id into v_id;
  if v_id is null then
    insert into public.review_requests
      (organization_id, subject_type, subject_id, note, requested_by)
    values (p_organization_id, p_subject_type, p_subject_id, p_note, (select auth.uid()))
    returning id into v_id;
  end if;
  perform app.emit_event(
    p_organization_id, 'review.request.created', 'review_request', v_id,
    jsonb_build_object('subject_type', p_subject_type, 'subject_id', p_subject_id),
    '{}'::jsonb,
    'review-requested:' || v_id::text || ':' || floor(extract(epoch from clock_timestamp()))::text
  );
  return v_id;
end;
$$;

create or replace function public.decide_review(
  p_request_id uuid,
  p_decision text,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row record;
begin
  if p_decision not in ('approved', 'changes_requested', 'closed') then
    raise exception 'invalid decision' using errcode = '22000';
  end if;
  select * into v_row from public.review_requests where id = p_request_id for update;
  if v_row.id is null then
    raise exception 'review request not found' using errcode = 'P0002';
  end if;
  if p_decision = 'closed' then
    if v_row.requested_by is distinct from (select auth.uid())
       and not app.has_org_permission(v_row.organization_id, 'content.publish') then
      raise exception 'permission denied' using errcode = '42501';
    end if;
  else
    if not app.has_org_permission(v_row.organization_id, 'content.publish')
       and not app.has_org_permission(v_row.organization_id, 'assessment.publish') then
      raise exception 'permission denied: deciding requires publish access' using errcode = '42501';
    end if;
    -- reviewers never approve their own request
    if v_row.requested_by = (select auth.uid()) then
      raise exception 'you cannot decide your own review request' using errcode = '42501';
    end if;
  end if;
  if v_row.status not in ('open', 'changes_requested') then
    raise exception 'this review request is already decided' using errcode = '23514';
  end if;

  update public.review_requests
     set status = p_decision, decided_by = (select auth.uid()),
         decided_at = now(), note = coalesce(p_note, note)
   where id = p_request_id;

  perform app.emit_event(
    v_row.organization_id, 'review.request.decided', 'review_request', p_request_id,
    jsonb_build_object('subject_type', v_row.subject_type, 'subject_id', v_row.subject_id),
    jsonb_build_object('decision', p_decision),
    'review-decided:' || p_request_id::text || ':' || floor(extract(epoch from clock_timestamp()))::text
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 15. Outbox → delivery fan-out + worker claim (service-role only)
-- ---------------------------------------------------------------------------
create or replace function app.claim_webhook_deliveries(p_limit integer default 10)
returns setof public.webhook_deliveries
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- fan out: pending outbox events × matching active endpoints
  insert into public.webhook_deliveries
    (organization_id, endpoint_id, outbox_event_id, correlation_id, causation_id)
  select o.organization_id, e.id, o.id,
         o.payload ->> 'id', o.payload ->> 'type'
    from public.outbox_events o
    join public.webhook_endpoints e
      on e.organization_id = o.organization_id
     and e.status = 'active'
     and (cardinality(e.event_types) = 0 or o.event_type = any (e.event_types))
   where o.status = 'pending'
  on conflict (endpoint_id, outbox_event_id) do nothing;

  -- events with no endpoints settle as processed (nothing owes delivery)
  update public.outbox_events o
     set status = 'processed', processed_at = now()
   where o.status = 'pending'
     and not exists (
       select 1 from public.webhook_endpoints e
       where e.organization_id = o.organization_id and e.status = 'active'
         and (cardinality(e.event_types) = 0 or o.event_type = any (e.event_types))
     );

  -- atomic claim with SKIP LOCKED: no duplicate concurrent processing
  return query
  update public.webhook_deliveries d
     set status = 'delivering', attempt_count = d.attempt_count + 1
   where d.id in (
     select id from public.webhook_deliveries
      where status in ('pending', 'failed') and next_attempt_at <= now()
      order by created_at
      limit p_limit
      for update skip locked
   )
  returning d.*;
end;
$$;
revoke all on function app.claim_webhook_deliveries(integer) from public, anon, authenticated;

create or replace function app.settle_webhook_delivery(
  p_delivery_id uuid,
  p_outcome text, -- 'delivered' | 'retry' | 'dead_letter'
  p_response_status integer default null,
  p_response_excerpt text default null,
  p_error text default null,
  p_backoff_seconds integer default 60
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row record;
begin
  select * into v_row from public.webhook_deliveries where id = p_delivery_id for update;
  if v_row.id is null then return; end if;

  if p_outcome = 'delivered' then
    update public.webhook_deliveries
       set status = 'delivered', response_status = p_response_status,
           response_excerpt = left(p_response_excerpt, 4096),
           delivered_at = now(), last_error = null
     where id = p_delivery_id;
    perform app.emit_event(
      v_row.organization_id, 'webhook.delivery.succeeded', 'webhook_delivery', p_delivery_id,
      jsonb_build_object('endpoint_id', v_row.endpoint_id),
      jsonb_build_object('attempts', v_row.attempt_count),
      'webhook-delivered:' || p_delivery_id::text
    );
  elsif p_outcome = 'retry' then
    update public.webhook_deliveries
       set status = 'failed', response_status = p_response_status,
           response_excerpt = left(p_response_excerpt, 4096),
           last_error = left(p_error, 500),
           next_attempt_at = now() + make_interval(secs => greatest(p_backoff_seconds, 1))
     where id = p_delivery_id;
  else
    update public.webhook_deliveries
       set status = 'dead_letter', response_status = p_response_status,
           response_excerpt = left(p_response_excerpt, 4096),
           last_error = left(p_error, 500)
     where id = p_delivery_id;
    perform app.emit_event(
      v_row.organization_id, 'webhook.delivery.failed', 'webhook_delivery', p_delivery_id,
      jsonb_build_object('endpoint_id', v_row.endpoint_id),
      jsonb_build_object('attempts', v_row.attempt_count),
      'webhook-dead:' || p_delivery_id::text
    );
  end if;

  -- settle the parent outbox event when every delivery reached a terminal state
  update public.outbox_events o
     set status = case
           when exists (select 1 from public.webhook_deliveries d
                        where d.outbox_event_id = o.id and d.status = 'dead_letter')
           then 'failed' else 'processed' end,
         processed_at = now()
   where o.id = v_row.outbox_event_id
     and not exists (
       select 1 from public.webhook_deliveries d
       where d.outbox_event_id = o.id
         and d.status in ('pending', 'delivering', 'failed')
     );
end;
$$;
revoke all on function app.settle_webhook_delivery(uuid, text, integer, text, text, integer) from public, anon, authenticated;

-- Manual retry (integrations.manage)
create or replace function public.retry_webhook_delivery(p_delivery_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row record;
begin
  select * into v_row from public.webhook_deliveries where id = p_delivery_id for update;
  if v_row.id is null then
    raise exception 'delivery not found' using errcode = 'P0002';
  end if;
  if not app.has_org_permission(v_row.organization_id, 'integrations.manage') then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  if v_row.status not in ('dead_letter', 'failed') then
    raise exception 'only failed deliveries can be retried' using errcode = '23514';
  end if;
  update public.webhook_deliveries
     set status = 'pending', next_attempt_at = now()
   where id = p_delivery_id;
  update public.outbox_events set status = 'pending', processed_at = null
   where id = v_row.outbox_event_id;
end;
$$;

revoke all on function public.reserve_ai_generation(uuid, text, text, text, text, text, text, uuid[]) from public, anon;
revoke all on function public.settle_ai_generation(uuid, boolean, jsonb, text, integer, integer, text) from public, anon;
revoke all on function public.resolve_ai_generation(uuid, boolean) from public, anon;
revoke all on function public.request_review(uuid, text, uuid, text) from public, anon;
revoke all on function public.decide_review(uuid, text, text) from public, anon;
revoke all on function public.retry_webhook_delivery(uuid) from public, anon;
grant execute on function public.reserve_ai_generation(uuid, text, text, text, text, text, text, uuid[]) to authenticated;
grant execute on function public.settle_ai_generation(uuid, boolean, jsonb, text, integer, integer, text) to authenticated;
grant execute on function public.resolve_ai_generation(uuid, boolean) to authenticated;
grant execute on function public.request_review(uuid, text, uuid, text) to authenticated;
grant execute on function public.decide_review(uuid, text, text) to authenticated;
grant execute on function public.retry_webhook_delivery(uuid) to authenticated;
