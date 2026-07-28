-- Invited users must be able to see their own pending invitations (matched
-- on their authenticated email) and the inviting organization's name/slug —
-- nothing else. Matching uses the JWT email, which Supabase Auth verifies.

create policy organization_memberships_select_own_invites
  on public.organization_memberships
  for select to authenticated
  using (
    status = 'invited'
    and lower(invited_email) = lower(coalesce((select auth.jwt()) ->> 'email', ''))
  );

create policy organizations_select_invited
  on public.organizations
  for select to authenticated
  using (
    exists (
      select 1 from public.organization_memberships mi
      where mi.organization_id = organizations.id
        and mi.status = 'invited'
        and lower(mi.invited_email) = lower(coalesce((select auth.jwt()) ->> 'email', ''))
    )
  );
