-- Learning-audience model (Validation phase correction). Audience is a
-- segmentation dimension DISTINCT from the NovaKore role: a Journey targets
-- one audience; an external identity belongs to an explicit set of audiences
-- (carried in the handoff claim, never inferred from the BFH app role).
-- Assignment/enrollment is gated so a Journey reaches only its audience.
--
-- NOTE: bfh_exchange_handoff's role granting is refined in the following
-- migration (bfh_audience_role_mapping) so any audience grants `learner`.

alter table public.learning_paths
  add column if not exists audience_key text
  check (audience_key is null or audience_key in ('member','coach','professional_learner'));

alter table app.external_identities
  add column if not exists audiences text[] not null default '{}';

drop function if exists public.bfh_exchange_handoff(text,text,text,text,text,text,bigint);
create or replace function public.bfh_exchange_handoff(
  p_organization_slug text, p_external_user_id text, p_email text,
  p_display_name text, p_access_level text, p_audiences text[],
  p_nonce text, p_expires_at bigint
) returns jsonb language plpgsql security definer set search_path to '' as $$
declare
  v_org uuid; v_user uuid; v_membership uuid; v_role uuid; v_role_key text;
  v_aud text[] := coalesce(p_audiences, '{}');
begin
  select id into v_org from public.organizations where slug = p_organization_slug;
  if v_org is null then return jsonb_build_object('ok', false, 'status', 'unknown_org'); end if;

  v_role_key := case p_access_level
    when 'member' then 'learner' when 'coach' then 'instructor'
    when 'admin' then 'organization_admin' else null end;
  if v_role_key is null then return jsonb_build_object('ok', false, 'status', 'invalid_access_level'); end if;

  if exists (select 1 from unnest(v_aud) a where a not in ('member','coach','professional_learner')) then
    return jsonb_build_object('ok', false, 'status', 'invalid_audience');
  end if;

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

  return jsonb_build_object('ok', true, 'status', 'linked', 'userId', v_user, 'email', p_email,
    'membershipId', v_membership, 'roleKey', v_role_key, 'audiences', to_jsonb(v_aud), 'organizationId', v_org);
end; $$;
revoke execute on function public.bfh_exchange_handoff(text,text,text,text,text,text[],text,bigint) from public, anon, authenticated;
grant execute on function public.bfh_exchange_handoff(text,text,text,text,text,text[],text,bigint) to service_role;

create or replace function public.bfh_enroll_or_assign_external(
  p_api_key text, p_kind text, p_external_user_id text,
  p_target_type text, p_target_slug text, p_due_at timestamptz,
  p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path to '' as $$
declare
  v_org uuid; v_membership uuid; v_target uuid; v_pinned uuid;
  v_existing uuid; v_enrollment uuid; v_stored jsonb; v_resp jsonb;
  v_audiences text[]; v_path_audience text;
begin
  select organization_id into v_org from app.organization_api_keys
    where status = 'active' and key_hash = app.bfh_hash_key(p_api_key);
  if v_org is null then return jsonb_build_object('ok', false, 'status', 'unauthorized'); end if;
  update app.organization_api_keys set last_used_at = now()
    where organization_id = v_org and key_hash = app.bfh_hash_key(p_api_key);

  select response into v_stored from app.bfh_api_idempotency
    where organization_id = v_org and idempotency_key = p_idempotency_key;
  if v_stored is not null then return v_stored || jsonb_build_object('replayed', true); end if;

  select m.id, ei.audiences into v_membership, v_audiences
    from app.external_identities ei
    join public.organization_memberships m
      on m.organization_id = ei.organization_id and m.user_id = ei.user_id
    where ei.organization_id = v_org and ei.provider = 'built_for_her'
      and ei.external_user_id = p_external_user_id and m.status = 'active';
  if v_membership is null then
    return jsonb_build_object('ok', false, 'status', 'not_found', 'code', 'unknown_external_user');
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
