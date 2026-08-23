-- outbox_events counted as content, so an organization became undeletable the
-- moment it was created — creation itself emits events into the outbox. The
-- same class of mistake as seeded terminology, found the same way: by trying
-- to delete a tenant that had genuinely never been used.
--
-- The distinction the allowlist encodes is whether a row records SOMEONE DOING
-- WORK or the platform operating. An undelivered event about an organization
-- being created says only that the organization was created, which is already
-- known from the organization row.
--
-- Deliberately not extended to webhook_deliveries: a delivery implies an
-- endpoint the customer configured, and webhook_endpoints is real work that
-- correctly blocks deletion on its own.

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
        -- Created BY provisioning or by choosing a use case, not by doing any
        -- work in the workspace.
        'organization_settings',
        'organization_branding',
        'organization_roles',
        'organization_role_permissions',
        'organization_memberships',
        'organization_member_roles',
        'organization_onboarding',
        'organization_terminology',
        -- The platform operating, rather than anyone using it: written by
        -- visiting at all, or by the act of creation itself.
        'audit_logs',
        'analytics_events',
        'onboarding_events',
        'outbox_events'
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
