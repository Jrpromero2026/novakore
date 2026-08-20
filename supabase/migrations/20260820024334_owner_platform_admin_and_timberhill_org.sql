-- Two changes, both deliberate.
--
-- 1. The owner's real account becomes a platform administrator.
--    Until now the ONLY platform administrator was `platform.admin@novakore.test`
--    — a seed fixture. The CTO review flagged this as a live security gap: a
--    fixture account held provisioning and suspension powers over every tenant
--    while the real owner held none. This closes it.
--
-- 2. Provision Timberhill Athletic Club — Personal Training as a tenant.
--    Uses the real RPC rather than hand-written inserts, so the organization
--    gets its full standard shape (roles, settings, defaults) exactly as any
--    future customer would.
--
-- CAVEAT FOR A FRESH ENVIRONMENT: this migration contains TENANT DATA, not
-- schema. It is recorded here only because the repo mirrors the remote
-- migration history exactly. Both statements are guarded (`on conflict do
-- nothing`, `if not exists`), so re-running is safe — but when standing up a
-- production project per docs/operations/production-setup.md, tenants should
-- be provisioned deliberately rather than inherited from this file. Review
-- before running it anywhere new.

insert into public.platform_administrators (user_id, status)
values ('00000000-0000-4000-8000-000000000031', 'active')
on conflict do nothing;

do $$
begin
  -- Act as the owner so the RPC's internal permission check passes on its own
  -- terms rather than being bypassed.
  perform set_config(
    'request.jwt.claims',
    '{"sub":"00000000-0000-4000-8000-000000000031"}',
    true
  );

  if not exists (select 1 from public.organizations where slug = 'timberhill-pt') then
    perform public.provision_organization(
      'Timberhill Athletic Club — Personal Training',
      'timberhill-pt',
      'jrpromero16@gmail.com'
    );
  end if;
end $$;
