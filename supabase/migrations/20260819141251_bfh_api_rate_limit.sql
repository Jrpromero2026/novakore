-- Enforce the per-key request ceiling inside the RPC that already proves who
-- the caller is.
--
-- The check sits immediately after key verification, which is what makes it
-- un-bypassable: the bucket is derived from the verified key hash, never
-- from anything the caller sends. The HTTP layer cannot skip it, and there
-- is no client-callable rate-limit function to poison.
--
-- Two deliberate orderings:
--   * BEFORE the idempotency replay lookup. A replay is still a request, and
--     charging it is what makes the ceiling real. A throttled client gets 429
--     with Retry-After and receives its stored response on the retry, so no
--     result is lost — only delayed.
--   * BEFORE the `last_used_at` write, so a throttled request performs no
--     write at all.
--
-- A 429 is deliberately NOT recorded in `bfh_api_idempotency`. Storing it
-- would pin that idempotency key to a transient failure and replay the 429
-- forever.
create or replace function public.bfh_enroll_or_assign_external(
  p_api_key text, p_kind text, p_external_user_id text,
  p_target_type text, p_target_slug text, p_due_at timestamptz,
  p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path to '' as $function$
declare
  v_org uuid; v_membership uuid; v_target uuid; v_pinned uuid;
  v_existing uuid; v_enrollment uuid; v_stored jsonb; v_resp jsonb;
  v_audiences text[]; v_path_audience text; v_estatus text;
  v_key_hash text; v_limit integer; v_rl record;
begin
  v_key_hash := app.bfh_hash_key(p_api_key);

  select organization_id, rate_limit_per_minute into v_org, v_limit
    from app.organization_api_keys
    where status = 'active' and key_hash = v_key_hash;
  if v_org is null then return jsonb_build_object('ok', false, 'status', 'unauthorized'); end if;

  select * into v_rl from app.consume_rate_limit('bfh_api:' || v_key_hash, v_limit, 60);
  if not v_rl.allowed then
    return jsonb_build_object(
      'ok', false, 'status', 'rate_limited', 'code', 'too_many_requests',
      'retryAfter', v_rl.retry_after, 'limit', v_limit);
  end if;

  update app.organization_api_keys set last_used_at = now()
    where organization_id = v_org and key_hash = v_key_hash;

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
end; $function$;
