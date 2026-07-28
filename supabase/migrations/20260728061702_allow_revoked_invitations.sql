-- A membership may end as 'removed' without ever binding a user: that is a
-- revoked invitation. Only ACTIVE and SUSPENDED memberships require a user.
-- (Found by isolation test #14: revoking an open invite violated the
-- original check constraint.)
alter table public.organization_memberships
  drop constraint organization_memberships_check;
alter table public.organization_memberships
  add constraint organization_memberships_user_required_when_live
  check (user_id is not null or status in ('invited', 'removed'));
