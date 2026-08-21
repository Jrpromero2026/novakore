-- Deleting an organization cascades across ~50 tables, and the audit trigger
-- fires for every row, each insert referencing the organization that is in
-- the process of disappearing. The first one fails on the foreign key, so
-- tenant deletion was impossible in practice.
--
-- Those per-row entries are worthless even when they succeed: they describe
-- the dismantling of a tenant nobody used, and they live in audit_logs, which
-- cascades from the same organization — so they would be deleted moments
-- after being written. The record that matters is the single platform-level
-- entry delete_empty_organization writes BEFORE the delete, with
-- organization_id null so it survives.
--
-- Scoped to one organization id rather than a blanket "auditing off" switch.
-- A flag that suppresses the audit trail generally is a bigger thing to
-- introduce than this job needs, and this one can only silence the tenant
-- that is being removed in the same transaction.
--
-- Only the early return below is new; the rest is the existing trigger body,
-- reproduced because plpgsql has no way to patch part of a function.

create or replace function app.audit_change()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_target_type text := tg_argv[0];
  v_action text;
  v_org_id uuid;
  v_target_id text;
  v_metadata jsonb;
  v_changed text[];
  v_before jsonb;
  v_after jsonb;
  v_old_status text;
  v_new_status text;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    v_old_status := to_jsonb(old) ->> 'status';
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    v_new_status := to_jsonb(new) ->> 'status';
  end if;

  if tg_table_name = 'organizations' then
    v_org_id := coalesce(new.id, old.id);
    v_target_id := coalesce(new.id, old.id)::text;
  elsif tg_table_name = 'organization_terminology' then
    v_org_id := coalesce(new.organization_id, old.organization_id);
    v_target_id := coalesce(new.term_key, old.term_key);
  elsif tg_table_name = 'organization_role_permissions' then
    v_org_id := coalesce(new.organization_id, old.organization_id);
    v_target_id := coalesce(new.role_id, old.role_id)::text || ':' || coalesce(new.permission_code, old.permission_code);
  elsif tg_table_name in ('organization_settings', 'organization_branding') then
    v_org_id := coalesce(new.organization_id, old.organization_id);
    v_target_id := v_org_id::text;
  else
    v_org_id := coalesce(new.organization_id, old.organization_id);
    v_target_id := coalesce(new.id, old.id)::text;
  end if;

  -- The organization is being removed in this transaction: the row this would
  -- reference is about to stop existing, and so would this entry.
  if v_org_id is not null
     and v_org_id::text = coalesce(current_setting('app.deleting_organization', true), '')
  then
    return coalesce(new, old);
  end if;

  if tg_op = 'INSERT' then
    v_action := case tg_table_name
      when 'organizations' then 'organization.created'
      when 'organization_memberships' then
        case v_new_status when 'invited' then 'membership.invited' else 'membership.created' end
      when 'organization_roles' then 'role.created'
      when 'organization_role_permissions' then 'role_permission.granted'
      when 'organization_member_roles' then 'member_role.assigned'
      when 'organization_terminology' then 'terminology.set'
      when 'organization_branding' then 'branding.updated'
      when 'organization_settings' then 'settings.updated'
      when 'academies' then 'academy.created'
      else lower(tg_table_name) || '.created'
    end;
    v_metadata := jsonb_build_object('row', to_jsonb(new) - 'updated_at');
  elsif tg_op = 'UPDATE' then
    select array_agg(d.key), jsonb_object_agg(d.key, d.old_value), jsonb_object_agg(d.key, d.new_value)
      into v_changed, v_before, v_after
      from (
        select n.key, o.value as old_value, n.value as new_value
        from jsonb_each(to_jsonb(new)) n
        join jsonb_each(to_jsonb(old)) o on o.key = n.key
        where n.value is distinct from o.value and n.key <> 'updated_at'
      ) d;

    if v_changed is null then
      return coalesce(new, old);
    end if;

    v_action := case
      when tg_table_name = 'organizations' and 'slug' = any (v_changed) then 'organization.slug_changed'
      when tg_table_name = 'organizations' then 'organization.updated'
      when tg_table_name = 'organization_memberships' then
        case
          when v_old_status = 'invited' and v_new_status = 'active' then 'membership.accepted'
          when v_new_status = 'suspended' then 'membership.suspended'
          when v_new_status = 'removed' then 'membership.removed'
          when v_old_status = 'suspended' and v_new_status = 'active' then 'membership.reactivated'
          else 'membership.updated'
        end
      when tg_table_name = 'organization_roles' and v_new_status = 'archived' and v_old_status <> 'archived'
        then 'role.archived'
      when tg_table_name = 'organization_roles' then 'role.updated'
      when tg_table_name = 'organization_terminology' then 'terminology.set'
      when tg_table_name = 'organization_branding' then 'branding.updated'
      when tg_table_name = 'organization_settings' then 'settings.updated'
      when tg_table_name = 'academies' and v_new_status = 'archived' and v_old_status <> 'archived'
        then 'academy.archived'
      when tg_table_name = 'academies' then 'academy.updated'
      else lower(tg_table_name) || '.updated'
    end;
    v_metadata := jsonb_build_object('changed', to_jsonb(v_changed), 'before', v_before, 'after', v_after);
  else
    v_action := case tg_table_name
      when 'organization_role_permissions' then 'role_permission.revoked'
      when 'organization_member_roles' then 'member_role.revoked'
      when 'organization_terminology' then 'terminology.removed'
      else lower(tg_table_name) || '.deleted'
    end;
    v_metadata := jsonb_build_object('row', to_jsonb(old) - 'updated_at');
  end if;

  insert into public.audit_logs (organization_id, actor_user_id, action, target_type, target_id, metadata, correlation_id)
  values (
    v_org_id,
    (select auth.uid()),
    v_action,
    v_target_type,
    v_target_id,
    v_metadata,
    nullif(current_setting('app.correlation_id', true), '')
  );

  return coalesce(new, old);
end;
$function$;
