-- Inviting someone and deciding what they may do were two separate steps:
-- invite by email, then find the row and assign a role. That left every new
-- member briefly present with no role, and made the common case (onboard a
-- learner) a two-stage operation an admin could abandon halfway.
--
-- The role is now optional on the invite itself. It is NOT folded into the
-- members permission: inviting requires org.members.manage, granting a role
-- requires org.roles.manage, and those are deliberately distinct. Accepting a
-- role here under the invite permission alone would hand anyone who can add
-- people the ability to make them an owner.
--
-- The composite foreign keys on organization_member_roles already guarantee
-- the role and academy belong to this organization, so cross-tenant grants
-- remain impossible by construction rather than by check.

drop function if exists public.invite_member(uuid, text);

create or replace function public.invite_member(
  p_organization_id uuid,
  p_email text,
  p_role_id uuid default null,
  p_academy_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_membership_id uuid;
  v_existing_user uuid;
begin
  if not app.has_org_permission(p_organization_id, 'org.members.manage') then
    raise exception 'permission denied' using errcode = '42501';
  end if;

  -- A role is a second, higher grant. Same rule the standalone assignment
  -- path enforces, so there is no cheaper route to the same outcome.
  if p_role_id is not null
     and not app.has_org_permission(p_organization_id, 'org.roles.manage') then
    raise exception 'permission denied: assigning a role requires org.roles.manage'
      using errcode = '42501';
  end if;

  if p_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'invalid email' using errcode = '22000';
  end if;

  select id into v_existing_user from auth.users where lower(email) = lower(p_email) limit 1;

  if v_existing_user is not null and exists (
    select 1 from public.organization_memberships
    where organization_id = p_organization_id
      and user_id = v_existing_user
      and status <> 'removed'
  ) then
    raise exception 'this person already has a membership in the organization' using errcode = '23505';
  end if;

  insert into public.organization_memberships (organization_id, invited_email, status, invited_at, created_by)
  values (p_organization_id, lower(p_email), 'invited', now(), (select auth.uid()))
  returning id into v_membership_id;

  if p_role_id is not null then
    insert into public.organization_member_roles
      (organization_id, membership_id, role_id, academy_id, created_by)
    values
      (p_organization_id, v_membership_id, p_role_id, p_academy_id, (select auth.uid()));
  end if;

  return v_membership_id;
end;
$function$;

comment on function public.invite_member(uuid, text, uuid, uuid) is
  'Invite a person by email, optionally granting a role in the same step. Invite needs org.members.manage; supplying a role additionally needs org.roles.manage.';
