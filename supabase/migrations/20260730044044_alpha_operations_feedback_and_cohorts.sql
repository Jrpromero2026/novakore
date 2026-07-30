-- Internal-alpha operations: in-app feedback + tester cohorts.
-- public schema (RLS-scoped app client queries it). Admin review is gated on
-- the existing analytics.view permission; any active member may submit.

create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  membership_id uuid not null references public.organization_memberships(id) on delete cascade,
  category text not null check (category in ('bug','usability','confusion','suggestion','feature')),
  severity text check (severity in ('blocker','major','minor','cosmetic')),
  message text not null,
  context jsonb not null default '{}',
  status text not null default 'new' check (status in ('new','triaged','in_progress','resolved','archived')),
  assignee_membership_id uuid references public.organization_memberships(id) on delete set null,
  notes text,
  resolution text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index feedback_org_status_idx on public.feedback (organization_id, status);
alter table public.feedback enable row level security;

create policy feedback_insert on public.feedback for insert to authenticated
  with check (exists (
    select 1 from public.organization_memberships m
    where m.id = membership_id and m.organization_id = feedback.organization_id
      and m.user_id = (select auth.uid()) and m.status = 'active'));
create policy feedback_select on public.feedback for select to authenticated
  using (
    app.has_org_permission(organization_id, 'analytics.view')
    or exists (select 1 from public.organization_memberships m
               where m.id = membership_id and m.user_id = (select auth.uid())));
create policy feedback_update on public.feedback for update to authenticated
  using (app.has_org_permission(organization_id, 'analytics.view'))
  with check (app.has_org_permission(organization_id, 'analytics.view'));

create table public.tester_labels (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  membership_id uuid not null references public.organization_memberships(id) on delete cascade,
  label text not null check (label in ('internal_alpha','founder','coach','staff')),
  created_at timestamptz not null default now(),
  unique (membership_id, label)
);
alter table public.tester_labels enable row level security;
create policy tester_labels_select on public.tester_labels for select to authenticated
  using (app.has_org_permission(organization_id, 'analytics.view'));
create policy tester_labels_insert on public.tester_labels for insert to authenticated
  with check (app.has_org_permission(organization_id, 'analytics.view'));
create policy tester_labels_delete on public.tester_labels for delete to authenticated
  using (app.has_org_permission(organization_id, 'analytics.view'));

create or replace function app.touch_feedback_updated_at() returns trigger
  language plpgsql set search_path to '' as $$
begin new.updated_at := now(); return new; end $$;
create trigger feedback_touch_updated before update on public.feedback
  for each row execute function app.touch_feedback_updated_at();

-- Seed dev tester cohorts for the bfh-dev fixtures.
insert into public.tester_labels (organization_id, membership_id, label)
select m.organization_id, m.id, v.label
from (values
  ('bfh.owner@novakore.test','staff'),
  ('bfh.owner@novakore.test','founder'),
  ('bfh.coach@novakore.test','coach'),
  ('bfh.instructor@novakore.test','coach'),
  ('bfh.member@novakore.test','internal_alpha')
) as v(email, label)
join auth.users u on lower(u.email) = v.email
join public.organization_memberships m on m.user_id = u.id
  and m.organization_id = '00000000-0000-4000-8000-000000000102'
on conflict (membership_id, label) do nothing;
