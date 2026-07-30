-- Fix: organization_member_roles.organization_id is NOT NULL; the handoff
-- exchange's role insert must populate it. Discovered by the operations
-- smoke test. Only the member-role insert changed vs. the prior migration.
create or replace function public.bfh_exchange_handoff(
  p_organization_slug text, p_external_user_id text, p_email text,
  p_display_name text, p_access_level text, p_nonce text, p_expires_at bigint
) returns jsonb language plpgsql security definer set search_path to '' as $$
declare
  v_org uuid; v_user uuid; v_membership uuid; v_role uuid; v_role_key text;
begin
  select id into v_org from public.organizations where slug = p_organization_slug;
  if v_org is null then return jsonb_build_object('ok', false, 'status', 'unknown_org'); end if;

  v_role_key := case p_access_level
    when 'member' then 'learner' when 'coach' then 'instructor'
    when 'admin' then 'organization_admin' else null end;
  if v_role_key is null then return jsonb_build_object('ok', false, 'status', 'invalid_access_level'); end if;

  begin
    insert into app.bfh_handoff_nonces(organization_id, nonce, external_user_id, expires_at)
    values (v_org, p_nonce, p_external_user_id, to_timestamp(p_expires_at));
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'status', 'nonce_replayed');
  end;

  select user_id into v_user from app.external_identities
    where organization_id = v_org and provider = 'built_for_her'
      and external_user_id = p_external_user_id;
  if v_user is null then
    select id into v_user from auth.users where lower(email) = lower(p_email);
    if v_user is null then
      return jsonb_build_object('ok', false, 'status', 'no_novakore_user');
    end if;
    insert into app.external_identities
      (organization_id, external_user_id, user_id, email, access_level)
    values (v_org, p_external_user_id, v_user, p_email, p_access_level)
    on conflict (organization_id, provider, user_id) do update
      set external_user_id = excluded.external_user_id,
          email = excluded.email, access_level = excluded.access_level,
          updated_at = now();
  else
    update app.external_identities
      set email = p_email, access_level = p_access_level, updated_at = now()
      where organization_id = v_org and provider = 'built_for_her'
        and external_user_id = p_external_user_id;
  end if;

  select id into v_membership from public.organization_memberships
    where organization_id = v_org and user_id = v_user;
  if v_membership is null then
    insert into public.organization_memberships(organization_id, user_id, status)
      values (v_org, v_user, 'active') returning id into v_membership;
  end if;

  select id into v_role from public.organization_roles
    where organization_id = v_org and key = v_role_key and is_system;
  if v_role is not null then
    insert into public.organization_member_roles(organization_id, membership_id, role_id)
      values (v_org, v_membership, v_role) on conflict do nothing;
  end if;

  return jsonb_build_object('ok', true, 'status', 'linked',
    'userId', v_user, 'email', p_email, 'membershipId', v_membership,
    'roleKey', v_role_key, 'organizationId', v_org);
end; $$;

revoke execute on function public.bfh_exchange_handoff(text,text,text,text,text,text,bigint) from public, anon, authenticated;
grant execute on function public.bfh_exchange_handoff(text,text,text,text,text,text,bigint) to service_role;
