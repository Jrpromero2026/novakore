-- Content templates: a reusable SHAPE, not a reusable paragraph.
--
-- `reusable_blocks` stores one block at a time, which is the wrong unit for
-- anything structured. A standard operating procedure is a shape — a code, a
-- purpose, ordered steps, a boundaries block, an owner and a review date —
-- and authoring that shape twenty-nine times by hand is what this replaces.
--
-- A template holds its blocks as an ordered JSONB array rather than rows in a
-- child table. Blocks are only ever read and written as a whole unit, never
-- queried individually, so a child table would add a join and a second set of
-- policies for no gain. Validation happens against the same block registry
-- the editor uses.
--
-- Scope is ONE organization, deliberately. Templates do not travel between
-- tenants; publishing across organizations raises publisher identity,
-- versioning and withdrawal questions this does not prejudge.

create table if not exists public.content_templates (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title           text not null,
  description     text,
  category        text not null default 'procedure',
  status          text not null default 'active',
  -- [{ key, label, help?, required }] — what the instantiation form asks for.
  variables       jsonb not null default '[]'::jsonb,
  -- [{ type, schemaVersion, data }] in render order.
  blocks          jsonb not null default '[]'::jsonb,
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  archived_at     timestamptz,

  constraint content_templates_title_len check (char_length(title) between 2 and 120),
  constraint content_templates_category_check
    check (category in ('procedure','onboarding','lesson','assessment_prep','other')),
  constraint content_templates_status_check
    check (status in ('active','archived')),
  -- Arrays, not objects: the app iterates both in order.
  constraint content_templates_variables_is_array
    check (jsonb_typeof(variables) = 'array'),
  constraint content_templates_blocks_is_array
    check (jsonb_typeof(blocks) = 'array')
);

comment on table public.content_templates is
  'Reusable multi-block content shapes with named variables, scoped to one organization.';
comment on column public.content_templates.variables is
  'Ordered [{key,label,help?,required}]. Keys are referenced in blocks as {{key}}.';
comment on column public.content_templates.blocks is
  'Ordered [{type,schemaVersion,data}]. Substitution happens on instantiation; the stored form keeps its placeholders.';

create index if not exists content_templates_org_status_idx
  on public.content_templates (organization_id, status, updated_at desc);

alter table public.content_templates enable row level security;

-- Mirrors reusable_blocks exactly: draft visibility to read, library.manage
-- to change. Deliberately no DELETE policy — templates archive, matching the
-- forward-only posture everywhere else in the schema.
create policy content_templates_select on public.content_templates
  for select using (app.has_org_permission(organization_id, 'content.view_draft'));

create policy content_templates_insert on public.content_templates
  for insert with check (app.has_org_permission(organization_id, 'library.manage'));

create policy content_templates_update on public.content_templates
  for update using (app.has_org_permission(organization_id, 'library.manage'))
  with check (app.has_org_permission(organization_id, 'library.manage'));

-- Same housekeeping the rest of the schema uses.
create trigger set_updated_at
  before update on public.content_templates
  for each row execute function app.set_updated_at();

create trigger audit_change
  after insert or update on public.content_templates
  for each row execute function app.audit_change();
