-- Guided onboarding (Academy Launch) — organization-scoped lifecycle state
-- and explicit onboarding events.
--
-- Design (docs/architecture/onboarding.md):
--  * Checklist COMPLETION is DERIVED from real org data at read time and is
--    never stored here. These tables carry only what data cannot prove:
--    presentation lifecycle (dismissed / celebrated) and explicit events
--    (learner preview opened, progress reviewed, walkthrough telemetry).
--  * Additive only. Rollback: drop table public.onboarding_events;
--    drop table public.organization_onboarding; (no other object touched —
--    derived completion keeps working without them).

-- ---------------------------------------------------------------------------
-- Lifecycle row: one per organization. Dismissing or celebrating the
-- checklist is org-level presentation state, gated on org.manage.
-- ---------------------------------------------------------------------------
create table public.organization_onboarding (
  organization_id uuid primary key
    references public.organizations (id) on delete cascade,
  dismissed_at timestamptz,
  completed_celebrated_at timestamptz,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Explicit onboarding events: the ONLY completion signals that cannot be
-- derived from domain data, plus walkthrough observability. No lesson
-- content, no personal data beyond the caller's own membership linkage.
-- ---------------------------------------------------------------------------
create table public.onboarding_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations (id) on delete cascade,
  membership_id uuid not null
    references public.organization_memberships (id) on delete cascade,
  event_type text not null
    check (event_type ~ '^onboarding\.[a-z_]+\.[a-z_]+$'),
  step_id text
    check (step_id is null or char_length(step_id) between 1 and 60),
  walkthrough_id text
    check (walkthrough_id is null or char_length(walkthrough_id) between 1 and 60),
  data jsonb not null default '{}'::jsonb
    check (jsonb_typeof(data) = 'object'),
  occurred_at timestamptz not null default now()
);

create index onboarding_events_org_type_idx
  on public.onboarding_events (organization_id, event_type, occurred_at desc);
create index onboarding_events_org_step_idx
  on public.onboarding_events (organization_id, step_id)
  where step_id is not null;
create index onboarding_events_membership_idx
  on public.onboarding_events (membership_id);

-- ---------------------------------------------------------------------------
-- Grants hygiene + RLS (organization isolation)
-- ---------------------------------------------------------------------------
revoke all on public.organization_onboarding, public.onboarding_events
from anon;

alter table public.organization_onboarding enable row level security;
alter table public.onboarding_events enable row level security;

-- Lifecycle: any active member reads (the checklist renders for authors and
-- admins alike); only org.manage holders dismiss/restore/celebrate.
create policy organization_onboarding_select on public.organization_onboarding
  for select to authenticated
  using (app.is_org_member(organization_id));
create policy organization_onboarding_insert on public.organization_onboarding
  for insert to authenticated
  with check (app.has_org_permission(organization_id, 'org.manage'));
create policy organization_onboarding_update on public.organization_onboarding
  for update to authenticated
  using (app.has_org_permission(organization_id, 'org.manage'))
  with check (app.has_org_permission(organization_id, 'org.manage'));

-- Events: a member may record events only under their OWN active membership
-- in that organization (spoofing another membership fails the check); any
-- active member of the org may read them (non-sensitive operational data).
create policy onboarding_events_insert on public.onboarding_events
  for insert to authenticated
  with check (exists (
    select 1 from public.organization_memberships m
    where m.id = membership_id
      and m.organization_id = onboarding_events.organization_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'));
create policy onboarding_events_select on public.onboarding_events
  for select to authenticated
  using (app.is_org_member(organization_id));

-- updated_at maintenance for the lifecycle row.
create or replace function app.touch_organization_onboarding() returns trigger
  language plpgsql set search_path to '' as $$
begin new.updated_at := now(); return new; end $$;
create trigger organization_onboarding_touch before update
  on public.organization_onboarding
  for each row execute function app.touch_organization_onboarding();
