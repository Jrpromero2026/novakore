-- BFH integration operations: handoff exchange (service_role-only), inbound
-- enrollment/assignment APIs (API-key-gated, verify_credential precedent),
-- and the outbound projection trigger that expresses NovaKore's own events
-- in the frozen BFH contract shapes.
--
-- NOTE: the handoff exchange's member-role insert is corrected in the
-- immediately following migration (bfh_handoff_member_role_org_fix) to
-- populate organization_member_roles.organization_id (NOT NULL).

-- Identity handoff exchange. Called ONLY by the bfh-handoff Edge Function
-- (service_role) AFTER it has verified the HMAC signature + timing.
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
    insert into public.organization_member_roles(membership_id, role_id)
      values (v_membership, v_role) on conflict do nothing;
  end if;

  return jsonb_build_object('ok', true, 'status', 'linked',
    'userId', v_user, 'email', p_email, 'membershipId', v_membership,
    'roleKey', v_role_key, 'organizationId', v_org);
end; $$;

revoke execute on function public.bfh_exchange_handoff(text,text,text,text,text,text,bigint) from public, anon, authenticated;
grant execute on function public.bfh_exchange_handoff(text,text,text,text,text,text,bigint) to service_role;

-- Inbound enrollment / assignment. API-key-gated (hash compared); the key IS
-- the authorization, so these are anon-executable like verify_credential.
create or replace function public.bfh_enroll_or_assign_external(
  p_api_key text, p_kind text, p_external_user_id text,
  p_target_type text, p_target_slug text, p_due_at timestamptz,
  p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path to '' as $$
declare
  v_org uuid; v_membership uuid; v_target uuid; v_pinned uuid;
  v_existing uuid; v_enrollment uuid; v_stored jsonb; v_resp jsonb;
begin
  select organization_id into v_org from app.organization_api_keys
    where status = 'active' and key_hash = app.bfh_hash_key(p_api_key);
  if v_org is null then return jsonb_build_object('ok', false, 'status', 'unauthorized'); end if;
  update app.organization_api_keys set last_used_at = now()
    where organization_id = v_org and key_hash = app.bfh_hash_key(p_api_key);

  select response into v_stored from app.bfh_api_idempotency
    where organization_id = v_org and idempotency_key = p_idempotency_key;
  if v_stored is not null then return v_stored || jsonb_build_object('replayed', true); end if;

  select m.id into v_membership
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
    select id into v_target from public.learning_paths
      where organization_id = v_org and slug = p_target_slug and status = 'active';
  else
    return jsonb_build_object('ok', false, 'status', 'invalid', 'code', 'bad_target_type');
  end if;
  if v_target is null then
    return jsonb_build_object('ok', false, 'status', 'not_found', 'code', 'unknown_target');
  end if;

  select id into v_existing from public.enrollments
    where membership_id = v_membership and target_type = p_target_type
      and coalesce(course_id, learning_path_id) = v_target
      and status <> 'withdrawn';
  if v_existing is not null then
    v_resp := jsonb_build_object('ok', false, 'status', 'conflict',
      'code', 'already_enrolled', 'enrollmentId', v_existing);
    insert into app.bfh_api_idempotency(organization_id, idempotency_key, request_kind, response)
      values (v_org, p_idempotency_key, p_kind, v_resp) on conflict do nothing;
    return v_resp;
  end if;

  if p_target_type = 'course' then
    insert into public.enrollments
      (organization_id, membership_id, target_type, course_id,
       pinned_course_version_id, source, due_at)
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
                       'pinned_course_version_id', v_pinned),
    jsonb_build_object('source', 'bfh_' || p_kind),
    'enrollment-created:' || v_enrollment::text
  );

  v_resp := jsonb_build_object('ok', true, 'status', 'created',
    'enrollmentId', v_enrollment, 'targetType', p_target_type, 'targetSlug', p_target_slug);
  insert into app.bfh_api_idempotency(organization_id, idempotency_key, request_kind, response)
    values (v_org, p_idempotency_key, p_kind, v_resp) on conflict do nothing;
  return v_resp;
end; $$;

revoke execute on function public.bfh_enroll_or_assign_external(text,text,text,text,text,timestamptz,text) from public;
grant execute on function public.bfh_enroll_or_assign_external(text,text,text,text,text,timestamptz,text) to anon, authenticated, service_role;

-- Outbound projection: express completion / assessment-result / credential
-- events in the frozen BFH contract shapes and enqueue them on the outbox.
create or replace function app.project_bfh_outbound()
returns trigger language plpgsql security definer set search_path to '' as $$
declare
  v_ext_user text; v_org_slug text;
  v_slug text; v_ver int; v_out_type text; v_payload jsonb;
  v_occurred text;
  v_ass_id uuid; v_ass_ver int; v_att_num int; v_score numeric;
  v_title text; v_code text; v_issued timestamptz; v_expires timestamptz;
begin
  if new.type not in ('learning.course.completed','learning.path.completed',
       'assessment.attempt.passed','assessment.attempt.failed',
       'credential.certificate.issued') then
    return new;
  end if;

  select external_user_id into v_ext_user from app.external_identities
    where organization_id = new.organization_id and user_id = new.actor_user_id
      and provider = 'built_for_her';
  if v_ext_user is null then return new; end if;

  select slug into v_org_slug from public.organizations where id = new.organization_id;
  v_occurred := to_char((new.occurred_at at time zone 'utc'),
    'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');

  if new.type = 'learning.course.completed' then
    select c.slug, cv.version_number into v_slug, v_ver
      from public.courses c
      left join public.enrollments e on e.course_id = c.id
        and e.organization_id = new.organization_id
        and e.membership_id in (
          select id from public.organization_memberships
          where user_id = new.actor_user_id and organization_id = new.organization_id)
      left join public.course_versions cv on cv.id = e.pinned_course_version_id
     where c.id = new.subject_id;
    v_out_type := 'learning.completion';
    v_payload := jsonb_build_object('v',1,'type','learning.completion','eventId',new.id,
      'occurredAt',v_occurred,'organizationSlug',v_org_slug,'externalUserId',v_ext_user,
      'target',jsonb_build_object('kind','course','courseSlug',v_slug,
        'courseVersionNumber',coalesce(v_ver,1)));

  elsif new.type = 'learning.path.completed' then
    select slug into v_slug from public.learning_paths where id = new.subject_id;
    v_out_type := 'learning.completion';
    v_payload := jsonb_build_object('v',1,'type','learning.completion','eventId',new.id,
      'occurredAt',v_occurred,'organizationSlug',v_org_slug,'externalUserId',v_ext_user,
      'target',jsonb_build_object('kind','learning_path','pathSlug',v_slug));

  elsif new.type in ('assessment.attempt.passed','assessment.attempt.failed') then
    select a.assessment_id, av.version_number, a.attempt_number, a.score_percent
      into v_ass_id, v_ass_ver, v_att_num, v_score
      from public.assessment_attempts a
      join public.assessment_versions av on av.id = a.assessment_version_id
     where a.id = new.subject_id;
    v_out_type := 'assessment.result';
    v_payload := jsonb_build_object('v',1,'type','assessment.result','eventId',new.id,
      'occurredAt',v_occurred,'organizationSlug',v_org_slug,'externalUserId',v_ext_user,
      'assessmentSlug', v_ass_id::text,
      'assessmentVersionNumber', coalesce(v_ass_ver,1),
      'attemptNumber', coalesce((new.data->>'attempt_number')::int, v_att_num, 1),
      'outcome', case when new.type='assessment.attempt.passed' then 'passed' else 'failed' end,
      'scorePercent', coalesce((new.data->>'score_percent')::numeric, v_score, 0));

  else -- credential.certificate.issued
    select title, verification_code, issued_at, expires_at
      into v_title, v_code, v_issued, v_expires
      from public.issued_credentials where id = new.subject_id;
    v_out_type := 'credential.issued';
    v_payload := jsonb_build_object('v',1,'type','credential.issued','eventId',new.id,
      'occurredAt',v_occurred,'organizationSlug',v_org_slug,'externalUserId',v_ext_user,
      'credentialTitle', v_title, 'verificationCode', v_code,
      'issuedAt', to_char((coalesce(v_issued,new.occurred_at) at time zone 'utc'),'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'expiresAt', case when v_expires is null then null
        else to_char((v_expires at time zone 'utc'),'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end);
  end if;

  insert into public.outbox_events (event_type, event_version, organization_id, payload)
    values (v_out_type, 1, new.organization_id, v_payload);
  return new;
end; $$;

create trigger project_bfh_outbound_after_insert
  after insert on public.analytics_events
  for each row execute function app.project_bfh_outbound();
