-- Release-gate: explicit external-identity revocation state.
-- A revoked mapping cannot complete SSO handoff or be enrolled/assigned via
-- /v1. The underlying NovaKore user + membership are untouched (revocation is
-- a mapping-level control). Revocation is auditable and tenant-scoped.

alter table app.external_identities
  add column if not exists status text not null default 'active'
  check (status in ('active','revoked'));

-- Admin control (integrations.manage) to revoke/restore a mapping, audited.
create or replace function public.bfh_set_external_identity_status(
  p_organization_slug text, p_external_user_id text, p_status text
) returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_org uuid; v_actor uuid := (select auth.uid());
begin
  if p_status not in ('active','revoked') then
    return jsonb_build_object('ok', false, 'status', 'invalid_status'); end if;
  select id into v_org from public.organizations where slug = p_organization_slug;
  if v_org is null then return jsonb_build_object('ok', false, 'status', 'unknown_org'); end if;
  if not app.has_org_permission(v_org, 'integrations.manage') then
    return jsonb_build_object('ok', false, 'status', 'forbidden'); end if;

  update app.external_identities set status = p_status, updated_at = now()
    where organization_id = v_org and provider = 'built_for_her'
      and external_user_id = p_external_user_id;
  if not found then return jsonb_build_object('ok', false, 'status', 'not_found'); end if;

  insert into public.audit_logs (organization_id, actor_user_id, action, target_type, target_id, metadata)
  values (v_org, v_actor,
    case when p_status = 'revoked' then 'external_identity.revoked' else 'external_identity.restored' end,
    'external_identity', null,
    jsonb_build_object('provider','built_for_her','external_user_id',p_external_user_id));
  return jsonb_build_object('ok', true, 'status', p_status);
end; $$;
revoke execute on function public.bfh_set_external_identity_status(text,text,text) from public;
grant execute on function public.bfh_set_external_identity_status(text,text,text) to anon, authenticated, service_role;

-- Exchange: refuse a revoked mapping (identity_revoked).
create or replace function public.bfh_exchange_handoff(
  p_organization_slug text, p_external_user_id text, p_email text,
  p_display_name text, p_access_level text, p_audiences text[],
  p_issued_at bigint, p_expires_at bigint, p_nonce text, p_signature text
) returns jsonb language plpgsql security definer set search_path to '' as $$
declare
  v_org uuid; v_user uuid; v_estatus text; v_membership uuid; v_mstatus text; v_role uuid;
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

  select user_id, status into v_user, v_estatus from app.external_identities
    where organization_id = v_org and provider = 'built_for_her' and external_user_id = p_external_user_id;
  if v_estatus = 'revoked' then
    return jsonb_build_object('ok', false, 'status', 'identity_revoked'); end if;
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

-- Enroll/assign: refuse a revoked mapping.
create or replace function public.bfh_enroll_or_assign_external(
  p_api_key text, p_kind text, p_external_user_id text,
  p_target_type text, p_target_slug text, p_due_at timestamptz,
  p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path to '' as $$
declare
  v_org uuid; v_membership uuid; v_target uuid; v_pinned uuid;
  v_existing uuid; v_enrollment uuid; v_stored jsonb; v_resp jsonb;
  v_audiences text[]; v_path_audience text; v_estatus text;
begin
  select organization_id into v_org from app.organization_api_keys
    where status = 'active' and key_hash = app.bfh_hash_key(p_api_key);
  if v_org is null then return jsonb_build_object('ok', false, 'status', 'unauthorized'); end if;
  update app.organization_api_keys set last_used_at = now()
    where organization_id = v_org and key_hash = app.bfh_hash_key(p_api_key);

  select response into v_stored from app.bfh_api_idempotency
    where organization_id = v_org and idempotency_key = p_idempotency_key;
  if v_stored is not null then return v_stored || jsonb_build_object('replayed', true); end if;

  select m.id, ei.audiences, ei.status into v_membership, v_audiences, v_estatus
    from app.external_identities ei
    join public.organization_memberships m
      on m.organization_id = ei.organization_id and m.user_id = ei.user_id
    where ei.organization_id = v_org and ei.provider = 'built_for_her'
      and ei.external_user_id = p_external_user_id and m.status = 'active';
  if v_membership is null then
    return jsonb_build_object('ok', false, 'status', 'not_found', 'code', 'unknown_external_user');
  end if;
  if v_estatus = 'revoked' then
    v_resp := jsonb_build_object('ok', false, 'status', 'forbidden', 'code', 'identity_revoked');
    insert into app.bfh_api_idempotency(organization_id, idempotency_key, request_kind, response)
      values (v_org, p_idempotency_key, p_kind, v_resp) on conflict do nothing;
    return v_resp;
  end if;

  if p_target_type = 'course' then
    select id, current_published_version_id into v_target, v_pinned
      from public.courses where organization_id = v_org and slug = p_target_slug
        and archived_at is null and current_published_version_id is not null;
  elsif p_target_type = 'learning_path' then
    select id, audience_key into v_target, v_path_audience from public.learning_paths
      where organization_id = v_org and slug = p_target_slug and status = 'active';
  else
    return jsonb_build_object('ok', false, 'status', 'invalid', 'code', 'bad_target_type');
  end if;
  if v_target is null then
    return jsonb_build_object('ok', false, 'status', 'not_found', 'code', 'unknown_target');
  end if;

  if v_path_audience is not null and not (v_path_audience = any (coalesce(v_audiences,'{}'))) then
    v_resp := jsonb_build_object('ok', false, 'status', 'forbidden', 'code', 'audience_mismatch',
      'requiredAudience', v_path_audience);
    insert into app.bfh_api_idempotency(organization_id, idempotency_key, request_kind, response)
      values (v_org, p_idempotency_key, p_kind, v_resp) on conflict do nothing;
    return v_resp;
  end if;

  select id into v_existing from public.enrollments
    where membership_id = v_membership and target_type = p_target_type
      and coalesce(course_id, learning_path_id) = v_target and status <> 'withdrawn';
  if v_existing is not null then
    v_resp := jsonb_build_object('ok', false, 'status', 'conflict',
      'code', 'already_enrolled', 'enrollmentId', v_existing);
    insert into app.bfh_api_idempotency(organization_id, idempotency_key, request_kind, response)
      values (v_org, p_idempotency_key, p_kind, v_resp) on conflict do nothing;
    return v_resp;
  end if;

  if p_target_type = 'course' then
    insert into public.enrollments
      (organization_id, membership_id, target_type, course_id, pinned_course_version_id, source, due_at)
    values (v_org, v_membership, 'course', v_target, v_pinned, 'assigned', p_due_at)
    returning id into v_enrollment;
  else
    insert into public.enrollments
      (organization_id, membership_id, target_type, learning_path_id, source, due_at)
    values (v_org, v_membership, 'learning_path', v_target, 'assigned', p_due_at)
    returning id into v_enrollment;
  end if;

  perform app.emit_event(
    v_org, 'enrollment.learner.enrolled', 'enrollment', v_enrollment,
    jsonb_build_object('target_type', p_target_type, 'target_id', v_target,
                       'pinned_course_version_id', v_pinned, 'audience', v_path_audience),
    jsonb_build_object('source', 'bfh_' || p_kind), 'enrollment-created:' || v_enrollment::text);

  v_resp := jsonb_build_object('ok', true, 'status', 'created',
    'enrollmentId', v_enrollment, 'targetType', p_target_type, 'targetSlug', p_target_slug,
    'audience', v_path_audience);
  insert into app.bfh_api_idempotency(organization_id, idempotency_key, request_kind, response)
    values (v_org, p_idempotency_key, p_kind, v_resp) on conflict do nothing;
  return v_resp;
end; $$;
revoke execute on function public.bfh_enroll_or_assign_external(text,text,text,text,text,timestamptz,text) from public;
grant execute on function public.bfh_enroll_or_assign_external(text,text,text,text,text,timestamptz,text) to anon, authenticated, service_role;
