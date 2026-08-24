-- The member email directory was gated on org.members.manage only, which
-- blanked learner identity for instructor-tier evaluators. Anyone trusted to
-- manage enrollments (assign learners to programs) necessarily works with
-- member identity, so the directory now also answers to enrollment.manage.
-- Learners and observers remain excluded.
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
    and (
      app.has_org_permission(p_organization_id, 'org.members.manage')
      or app.has_org_permission(p_organization_id, 'enrollment.manage')
    );
$$;
