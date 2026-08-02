-- Phase 6 fix: set_organization_status wrote to non-existent audit columns
-- (subject_type/subject_id/detail); audit_logs uses target_type/target_id/
-- metadata. Caught by the real-DB gating test before it ever reached main.
create or replace function public.set_organization_status(
  p_organization_id uuid,
  p_status text
) returns jsonb
language plpgsql
security definer
set search_path = public, app, extensions
as $$
begin
  if not app.is_platform_admin() then
    return jsonb_build_object('status', 'forbidden');
  end if;
  if p_status not in ('active', 'suspended') then
    return jsonb_build_object('status', 'invalid');
  end if;

  update public.organizations set status = p_status
  where id = p_organization_id;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  insert into public.audit_logs (organization_id, actor_user_id, action, target_type, target_id, metadata)
  values (p_organization_id, auth.uid(), 'platform.organization.status_changed',
          'organization', p_organization_id, jsonb_build_object('status', p_status));

  return jsonb_build_object('status', 'ok', 'new_status', p_status);
end;
$$;
