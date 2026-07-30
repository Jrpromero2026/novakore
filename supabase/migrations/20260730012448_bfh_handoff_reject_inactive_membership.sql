-- Hardening (failure-mode validation): the SSO exchange must refuse a
-- disabled/suspended/removed NovaKore membership rather than re-grant roles
-- and let a session be minted. Existing-user handoffs whose membership is not
-- active return 'membership_inactive'. NovaKore-side revocation of a BFH
-- mapping is therefore: suspend the membership (durable, checked here).
create or replace function public.bfh_exchange_handoff(
  p_organization_slug text, p_external_user_id text, p_email text,
  p_display_name text, p_access_level text, p_audiences text[],
  p_issued_at bigint, p_expires_at bigint, p_nonce text, p_signature text
) returns jsonb language plpgsql security definer set search_path to '' as $$
declare
  v_org uuid; v_user uuid; v_membership uuid; v_mstatus text; v_role uuid;
  v_serving_role_key text; v_aud text[] := coalesce(p_audiences, '{}');
  v_granted text[] := '{}';
  v_secret text; v_msg text; v_expected text;
  v_now bigint := floor(extract(epoch from now()))::bigint; v_skew int := 5;
begin
  select id into v_org from public.organizations where slug = p_organization_slug;
  if v_org is null then return jsonb_build_object('ok', false, 'status', 'unknown_org'); end if;

  v_serving_role_key := case p_access_level
    when 'member' then null when 'coach' then 'instructor'
    when 'admin' then 'organization_admin' else '__invalid__' end;
  if v_serving_role_key = '__invalid__' then
    return jsonb_build_object('ok', false, 'status', 'invalid_access_level'); end if;
  if exists (select 1 from unnest(v_aud) a where a not in ('member','coach','professional_learner')) then
    return jsonb_build_object('ok', false, 'status', 'invalid_audience'); end if;
  if array_length(v_aud,1) is null then
    return jsonb_build_object('ok', false, 'status', 'no_audience'); end if;

  select handoff_secret into v_secret from app.bfh_integration_config where organization_id = v_org;
  if v_secret is null then return jsonb_build_object('ok', false, 'status', 'no_integration_config'); end if;
  v_msg := 'v1|' || p_organization_slug || '|' || p_external_user_id || '|' || p_email || '|' ||
    p_access_level || '|' ||
    array_to_string(array(select unnest(v_aud) order by 1), ',') || '|' ||
    p_issued_at::text || '|' || p_expires_at::text || '|' || p_nonce;
  v_expected := encode(extensions.hmac(v_msg, v_secret, 'sha256'), 'hex');
  if v_expected is distinct from lower(p_signature) then
    return jsonb_build_object('ok', false, 'status', 'bad_signature'); end if;

  if p_expires_at <= p_issued_at then return jsonb_build_object('ok', false, 'status', 'bad_window'); end if;
  if p_expires_at - p_issued_at > 120 then return jsonb_build_object('ok', false, 'status', 'lifetime_exceeded'); end if;
  if p_issued_at - v_skew > v_now then return jsonb_build_object('ok', false, 'status', 'issued_in_future'); end if;
  if v_now - v_skew > p_expires_at then return jsonb_build_object('ok', false, 'status', 'expired'); end if;

  begin
    insert into app.bfh_handoff_nonces(organization_id, nonce, external_user_id, expires_at)
    values (v_org, p_nonce, p_external_user_id, to_timestamp(p_expires_at));
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'status', 'nonce_replayed');
  end;

  select user_id into v_user from app.external_identities
    where organization_id = v_org and provider = 'built_for_her' and external_user_id = p_external_user_id;
  if v_user is null then
    select id into v_user from auth.users where lower(email) = lower(p_email);
    if v_user is null then return jsonb_build_object('ok', false, 'status', 'no_novakore_user'); end if;
    insert into app.external_identities
      (organization_id, external_user_id, user_id, email, access_level, audiences)
    values (v_org, p_external_user_id, v_user, p_email, p_access_level, v_aud)
    on conflict (organization_id, provider, user_id) do update
      set external_user_id = excluded.external_user_id, email = excluded.email,
          access_level = excluded.access_level, audiences = excluded.audiences, updated_at = now();
  else
    update app.external_identities set email = p_email, access_level = p_access_level,
      audiences = v_aud, updated_at = now()
      where organization_id = v_org and provider = 'built_for_her' and external_user_id = p_external_user_id;
  end if;

  select id, status into v_membership, v_mstatus from public.organization_memberships
    where organization_id = v_org and user_id = v_user;
  if v_membership is not null and v_mstatus is distinct from 'active' then
    return jsonb_build_object('ok', false, 'status', 'membership_inactive');
  end if;
  if v_membership is null then
    insert into public.organization_memberships(organization_id, user_id, status)
      values (v_org, v_user, 'active') returning id into v_membership;
  end if;

  select id into v_role from public.organization_roles where organization_id=v_org and key='learner' and is_system;
  if v_role is not null then
    insert into public.organization_member_roles(organization_id,membership_id,role_id)
      values (v_org,v_membership,v_role) on conflict do nothing;
    v_granted := array_append(v_granted,'learner');
  end if;
  if v_serving_role_key is not null then
    select id into v_role from public.organization_roles where organization_id=v_org and key=v_serving_role_key and is_system;
    if v_role is not null then
      insert into public.organization_member_roles(organization_id,membership_id,role_id)
        values (v_org,v_membership,v_role) on conflict do nothing;
      v_granted := array_append(v_granted,v_serving_role_key);
    end if;
  end if;

  return jsonb_build_object('ok', true, 'status', 'linked', 'userId', v_user, 'email', p_email,
    'membershipId', v_membership, 'roles', to_jsonb(v_granted), 'audiences', to_jsonb(v_aud),
    'organizationId', v_org);
end; $$;
revoke execute on function public.bfh_exchange_handoff(text,text,text,text,text,text[],bigint,bigint,text,text) from public, anon, authenticated;
grant execute on function public.bfh_exchange_handoff(text,text,text,text,text,text[],bigint,bigint,text,text) to service_role;
