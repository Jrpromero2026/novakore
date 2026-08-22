-- Signup now seeds terminology from the chosen use case, so every self-serve
-- organization has rows in organization_terminology from the moment it
-- exists. Those counted as content, which meant no self-serve tenant could
-- ever qualify as empty — precisely the tenants the cleanup was built for.
--
-- Terminology is configuration, not work. "This organization calls a course
-- an SOP" says nothing about whether anyone ever created one. The signals
-- that do say something — courses, enrollments, credentials, members, age —
-- are untouched, so nothing that holds actual work becomes deletable.

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
