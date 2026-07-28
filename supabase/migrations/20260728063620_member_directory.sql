-- Member email directory for the admin UI.
-- auth.users is not readable through the API; this SECURITY DEFINER function
-- exposes exactly (membership_id, email) and only to holders of
-- org.members.manage in that organization.
create or replace function public.get_member_emails(p_organization_id uuid)
returns table (membership_id uuid, email text)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, coalesce(u.email, m.invited_email)
  from public.organization_memberships m
  left join auth.users u on u.id = m.user_id
  where m.organization_id = p_organization_id
    and app.has_org_permission(p_organization_id, 'org.members.manage');
$$;

revoke all on function public.get_member_emails(uuid) from public, anon;
grant execute on function public.get_member_emails(uuid) to authenticated;
