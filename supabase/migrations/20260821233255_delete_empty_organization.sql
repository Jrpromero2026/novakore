-- Removing tenants that were never used, and only those.
--
-- Open signup means abandoned organizations accumulate: someone tries the
-- product, creates a workspace, never returns. Those are safe to remove
-- because nothing was ever promised about them. An organization that holds a
-- course, an enrollment or an issued credential is NOT in that category and
-- never becomes so through mere inactivity — a credential has a public
-- verification URL, and deleting the issuer silently breaks someone's proof
-- that they earned it. Those get suspended or archived, by hand, deliberately.
--
-- The emptiness test discovers content tables at runtime instead of listing
-- them. There are 54 tables carrying organization_id today; a hand-written
-- list would silently stop protecting the next one added, and "we forgot to
-- add the table" is how this kind of job destroys real data. Anything with an
-- organization_id is treated as content unless it is on the small allowlist
-- of rows that provisioning itself creates.
--
-- Superseded below by 20260821233329 (blocker array) and 20260821233522
-- (audit scope); both were found by running it.

create or replace function app.organization_content(p_organization_id uuid)
returns table (source text, rows bigint)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  r record;
  n bigint;
begin
  for r in
    select c.table_schema as s, c.table_name as t
    from information_schema.columns c
    join information_schema.tables ti
      on ti.table_schema = c.table_schema
     and ti.table_name = c.table_name
     and ti.table_type = 'BASE TABLE'
    where c.column_name = 'organization_id'
      and c.table_schema in ('public', 'app')
      and c.table_name not in (
        'organizations',
        -- Created BY provisioning, not by the customer. Their presence says
        -- nothing about whether the workspace was ever used.
        'organization_settings',
        'organization_branding',
        'organization_roles',
        'organization_role_permissions',
        'organization_memberships',
        'organization_member_roles',
        'organization_onboarding',
        -- Written by visiting at all, including the operator checking whether
        -- the tenant is abandoned.
        'audit_logs',
        'analytics_events',
        'onboarding_events'
      )
    order by c.table_schema, c.table_name
  loop
    execute format(
      'select count(*) from %I.%I where organization_id = $1', r.s, r.t
    ) into n using p_organization_id;
    if n > 0 then
      source := r.s || '.' || r.t;
      rows := n;
      return next;
    end if;
  end loop;
end;
$function$;

comment on function app.organization_content(uuid) is
  'Non-empty content tables for an organization, discovered at runtime. Empty result means nothing was ever created in the tenant.';
