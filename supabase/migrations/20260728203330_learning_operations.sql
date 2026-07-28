-- NovaKore Phase 1C — event emission + transactional learning operations.
-- Every RPC is SECURITY DEFINER with empty search_path, internal deny-by-
-- default authorization, and writes its analytics/outbox records in the SAME
-- transaction as the domain change (transactional outbox, ADR-018).

-- ---------------------------------------------------------------------------
-- app.emit_event: analytics event + outbox row, idempotent by key.
-- ---------------------------------------------------------------------------
create or replace function app.emit_event(
  p_organization_id uuid,
  p_type text,
  p_subject_kind text,
  p_subject_id uuid,
  p_context jsonb,
  p_data jsonb,
  p_idempotency_key text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_id uuid;
  v_actor uuid := (select auth.uid());
begin
  insert into public.analytics_events
    (v, type, organization_id, actor_user_id, subject_kind, subject_id,
     context, data, correlation_id, idempotency_key)
  values
    (1, p_type, p_organization_id, v_actor, p_subject_kind, p_subject_id,
     coalesce(p_context, '{}'::jsonb), coalesce(p_data, '{}'::jsonb),
     nullif(current_setting('app.correlation_id', true), ''), p_idempotency_key)
  on conflict (idempotency_key) do nothing
  returning id into v_event_id;

  -- Duplicate (replayed) events write nothing further: idempotent.
  if v_event_id is null then
    return;
  end if;

  insert into public.outbox_events (event_type, event_version, organization_id, payload)
  values (
    p_type, 1, p_organization_id,
    jsonb_build_object(
      'id', v_event_id, 'v', 1, 'type', p_type,
      'organization_id', p_organization_id,
      'occurred_at', now(), 'actor_user_id', v_actor,
      'subject_kind', p_subject_kind, 'subject_id', p_subject_id,
      'context', coalesce(p_context, '{}'::jsonb),
      'data', coalesce(p_data, '{}'::jsonb)
    )
  );
end;
$$;

revoke all on function app.emit_event(uuid, text, text, uuid, jsonb, jsonb, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- publish_lesson: freeze the draft's validated blocks into an immutable
-- version. The application layer deep-validates every block with the domain
-- registry before calling; this function enforces the structural invariants.
-- ---------------------------------------------------------------------------
create or replace function public.publish_lesson(p_lesson_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lesson record;
  v_blocks jsonb;
  v_next integer;
  v_version_id uuid;
begin
  select * into v_lesson from public.lessons where id = p_lesson_id for update;
  if v_lesson.id is null then
    raise exception 'lesson not found' using errcode = 'P0002';
  end if;
  if not app.has_org_permission(v_lesson.organization_id, 'content.publish') then
    raise exception 'permission denied: publishing requires content.publish' using errcode = '42501';
  end if;
  if v_lesson.archived_at is not null then
    raise exception 'archived lessons cannot be published' using errcode = '23514';
  end if;

  select jsonb_agg(
           jsonb_build_object(
             'id', b.id, 'type', b.block_type, 'schemaVersion', b.schema_version,
             'data', b.data, 'position', b.position
           ) order by b.position
         )
    into v_blocks
    from public.content_blocks b
   where b.lesson_id = p_lesson_id;

  if v_blocks is null or jsonb_array_length(v_blocks) = 0 then
    raise exception 'a lesson needs at least one content block to publish' using errcode = '23514';
  end if;

  select coalesce(max(version_number), 0) + 1 into v_next
    from public.lesson_versions where lesson_id = p_lesson_id;

  insert into public.lesson_versions
    (organization_id, lesson_id, course_id, version_number, title, summary,
     required, estimated_minutes, blocks, published_by)
  values
    (v_lesson.organization_id, v_lesson.id, v_lesson.course_id, v_next,
     v_lesson.title, v_lesson.summary, v_lesson.required,
     v_lesson.estimated_minutes, v_blocks, (select auth.uid()))
  returning id into v_version_id;

  update public.lessons
     set current_published_version_id = v_version_id, status = 'published'
   where id = p_lesson_id;

  perform app.emit_event(
    v_lesson.organization_id, 'content.lesson.published', 'lesson', v_lesson.id,
    jsonb_build_object('lesson_version_id', v_version_id, 'course_id', v_lesson.course_id),
    jsonb_build_object('version_number', v_next),
    'lesson-published:' || v_version_id::text
  );
  return v_version_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- publish_course: transactionally pin exact lesson versions and structure.
-- Fails cleanly (nothing written) when any lesson lacks a published version.
-- ---------------------------------------------------------------------------
create or replace function public.publish_course(p_course_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_course record;
  v_unpublished text;
  v_structure jsonb;
  v_next integer;
  v_version_id uuid;
begin
  select * into v_course from public.courses where id = p_course_id for update;
  if v_course.id is null then
    raise exception 'course not found' using errcode = 'P0002';
  end if;
  if not app.has_org_permission(v_course.organization_id, 'content.publish') then
    raise exception 'permission denied: publishing requires content.publish' using errcode = '42501';
  end if;
  if v_course.archived_at is not null then
    raise exception 'archived courses cannot be published' using errcode = '23514';
  end if;

  -- every non-archived lesson must already have a published version
  select string_agg(l.title, ', ') into v_unpublished
    from public.lessons l
    join public.modules m on m.id = l.module_id
   where l.course_id = p_course_id
     and l.archived_at is null and m.archived_at is null
     and l.current_published_version_id is null;
  if v_unpublished is not null then
    raise exception 'publish blocked: these lessons have no published version: %', v_unpublished
      using errcode = '23514';
  end if;

  -- exact pinned structure (matches domain courseStructureSchema v1)
  select jsonb_build_object(
           'schemaVersion', 1,
           'modules', jsonb_agg(module_obj order by module_position)
         )
    into v_structure
    from (
      select m.position as module_position,
             jsonb_build_object(
               'moduleId', m.id, 'title', m.title, 'position', m.position,
               'lessons', (
                 select jsonb_agg(
                          jsonb_build_object(
                            'lessonId', l.id,
                            'lessonVersionId', lv.id,
                            'versionNumber', lv.version_number,
                            'title', lv.title,
                            'position', l.position,
                            'required', l.required
                          ) order by l.position
                        )
                   from public.lessons l
                   join public.lesson_versions lv on lv.id = l.current_published_version_id
                  where l.module_id = m.id and l.archived_at is null
               )
             ) as module_obj
        from public.modules m
       where m.course_id = p_course_id and m.archived_at is null
         and exists (
           select 1 from public.lessons l2
           where l2.module_id = m.id and l2.archived_at is null
         )
    ) modules_query;

  if v_structure is null or jsonb_array_length(v_structure -> 'modules') = 0 then
    raise exception 'publish blocked: the course has no modules with lessons' using errcode = '23514';
  end if;

  select coalesce(max(version_number), 0) + 1 into v_next
    from public.course_versions where course_id = p_course_id;

  insert into public.course_versions
    (organization_id, course_id, version_number, title, summary, structure,
     completion_rule, supersedes_version_id, published_by)
  values
    (v_course.organization_id, v_course.id, v_next, v_course.title,
     v_course.summary, v_structure, v_course.completion_rule,
     v_course.current_published_version_id, (select auth.uid()))
  returning id into v_version_id;

  update public.courses
     set current_published_version_id = v_version_id, status = 'published'
   where id = p_course_id;

  perform app.emit_event(
    v_course.organization_id, 'content.course.published', 'course', v_course.id,
    jsonb_build_object('course_version_id', v_version_id),
    jsonb_build_object('version_number', v_next),
    'course-published:' || v_version_id::text
  );
  return v_version_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- create_enrollment (ADR-017 pinning): course targets pin the exact current
-- published version at creation; path targets pin per-course at first start.
-- ---------------------------------------------------------------------------
create or replace function public.create_enrollment(
  p_membership_id uuid,
  p_target_type text,
  p_target_id uuid,
  p_source text default 'assigned'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_membership record;
  v_pinned uuid;
  v_allow_self boolean;
  v_enrollment_id uuid;
begin
  if p_target_type not in ('course', 'learning_path') or p_source not in ('assigned', 'self') then
    raise exception 'invalid enrollment parameters' using errcode = '22000';
  end if;

  select * into v_membership
    from public.organization_memberships where id = p_membership_id;
  if v_membership.id is null or v_membership.status <> 'active' then
    raise exception 'membership is not active' using errcode = '23514';
  end if;

  if p_source = 'assigned' then
    if not app.has_org_permission(v_membership.organization_id, 'enrollment.manage') then
      raise exception 'permission denied' using errcode = '42501';
    end if;
  else
    if v_membership.user_id is distinct from (select auth.uid()) then
      raise exception 'self-enrollment must target your own membership' using errcode = '42501';
    end if;
    if not app.has_org_permission(v_membership.organization_id, 'enrollment.self') then
      raise exception 'permission denied' using errcode = '42501';
    end if;
  end if;

  if p_target_type = 'course' then
    select current_published_version_id, allow_self_enrollment into v_pinned, v_allow_self
      from public.courses
     where id = p_target_id and organization_id = v_membership.organization_id
       and archived_at is null;
    if v_pinned is null then
      raise exception 'the course has no published version to enroll into' using errcode = '23514';
    end if;
    if p_source = 'self' and not v_allow_self then
      raise exception 'this course does not allow self-enrollment' using errcode = '42501';
    end if;

    insert into public.enrollments
      (organization_id, membership_id, target_type, course_id,
       pinned_course_version_id, source, assigned_by)
    values
      (v_membership.organization_id, p_membership_id, 'course', p_target_id,
       v_pinned, p_source, case when p_source = 'assigned' then (select auth.uid()) end)
    returning id into v_enrollment_id;
  else
    select allow_self_enrollment into v_allow_self
      from public.learning_paths
     where id = p_target_id and organization_id = v_membership.organization_id
       and status = 'active';
    if v_allow_self is null then
      raise exception 'the learning path is not active' using errcode = '23514';
    end if;
    if p_source = 'self' and not v_allow_self then
      raise exception 'this path does not allow self-enrollment' using errcode = '42501';
    end if;

    insert into public.enrollments
      (organization_id, membership_id, target_type, learning_path_id, source, assigned_by)
    values
      (v_membership.organization_id, p_membership_id, 'learning_path', p_target_id,
       p_source, case when p_source = 'assigned' then (select auth.uid()) end)
    returning id into v_enrollment_id;
  end if;

  perform app.emit_event(
    v_membership.organization_id, 'enrollment.learner.enrolled', 'enrollment', v_enrollment_id,
    jsonb_build_object('target_type', p_target_type, 'target_id', p_target_id,
                       'pinned_course_version_id', v_pinned),
    jsonb_build_object('source', p_source),
    'enrollment-created:' || v_enrollment_id::text
  );
  return v_enrollment_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Internal: evaluate + record course completion for an enrollment/course.
-- Mirrors the domain completion rules (all_required / percentage); the
-- domain function is the UI/computation mirror, this is the transactional
-- authority.
-- ---------------------------------------------------------------------------
create or replace function app.evaluate_course_completion(
  p_enrollment_id uuid,
  p_course_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_course_progress record;
  v_version record;
  v_required integer;
  v_done integer;
  v_rule jsonb;
  v_complete boolean := false;
  v_enrollment record;
  v_all_courses_done boolean;
begin
  select * into v_course_progress
    from public.progress_records
   where enrollment_id = p_enrollment_id and course_id = p_course_id
     and subject_type = 'course'
   for update;
  if v_course_progress.id is null or v_course_progress.status = 'completed' then
    return;
  end if;

  select * into v_version from public.course_versions
   where id = v_course_progress.course_version_id;

  select count(*) into v_required
    from jsonb_path_query(v_version.structure, '$.modules[*].lessons[*] ? (@.required == true)');

  select count(*) into v_done
    from jsonb_path_query(v_version.structure, '$.modules[*].lessons[*] ? (@.required == true)') as entry(value)
   where exists (
     select 1 from public.progress_records pr
      where pr.enrollment_id = p_enrollment_id
        and pr.lesson_id = ((entry.value ->> 'lessonId'))::uuid
        and pr.status in ('completed', 'exempted')
   );

  v_rule := v_version.completion_rule;
  if v_required > 0 then
    if v_rule ->> 'type' = 'percentage_of_required_lessons' then
      v_complete := (v_done::numeric / v_required) * 100 >= (v_rule ->> 'percent')::numeric;
    else
      v_complete := v_done = v_required;
    end if;
  end if;
  if not v_complete then
    return;
  end if;

  update public.progress_records
     set status = 'completed', completed_at = now()
   where id = v_course_progress.id;

  perform app.emit_event(
    v_course_progress.organization_id, 'learning.course.completed', 'course', p_course_id,
    jsonb_build_object('enrollment_id', p_enrollment_id,
                       'course_version_id', v_course_progress.course_version_id),
    '{}'::jsonb,
    'course-completed:' || p_enrollment_id::text || ':' || p_course_id::text
  );

  select * into v_enrollment from public.enrollments where id = p_enrollment_id for update;

  if v_enrollment.target_type = 'course' then
    update public.enrollments
       set status = 'completed', completed_at = now()
     where id = p_enrollment_id and status = 'active';
    perform app.emit_event(
      v_enrollment.organization_id, 'enrollment.learner.completed', 'enrollment', p_enrollment_id,
      jsonb_build_object('course_version_id', v_course_progress.course_version_id),
      '{}'::jsonb,
      'enrollment-completed:' || p_enrollment_id::text
    );
  else
    -- path enrollment: complete when every node's course is completed
    select not exists (
      select 1 from public.path_nodes pn
      where pn.path_id = v_enrollment.learning_path_id
        and not exists (
          select 1 from public.progress_records pr
          where pr.enrollment_id = p_enrollment_id
            and pr.course_id = pn.course_id
            and pr.subject_type = 'course'
            and pr.status = 'completed'
        )
    ) into v_all_courses_done;

    if v_all_courses_done then
      update public.enrollments
         set status = 'completed', completed_at = now()
       where id = p_enrollment_id and status = 'active';
      perform app.emit_event(
        v_enrollment.organization_id, 'learning.path.completed', 'learning_path',
        v_enrollment.learning_path_id,
        jsonb_build_object('enrollment_id', p_enrollment_id),
        '{}'::jsonb,
        'path-completed:' || p_enrollment_id::text
      );
    end if;
  end if;
end;
$$;

revoke all on function app.evaluate_course_completion(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- record_lesson_progress: the learner's own transactional progress path.
-- Hard invariants enforced here; deterministic sequence gating lives in the
-- single domain computation invoked by the server layer.
-- ---------------------------------------------------------------------------
create or replace function public.record_lesson_progress(
  p_enrollment_id uuid,
  p_lesson_id uuid,
  p_action text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_e record;
  v_membership record;
  v_course_id uuid;
  v_course_progress record;
  v_pin uuid;
  v_entry jsonb;
  v_lesson_version_id uuid;
  v_existing record;
  v_node record;
  v_unmet text;
begin
  if p_action not in ('start', 'complete') then
    raise exception 'invalid action' using errcode = '22000';
  end if;

  select * into v_e from public.enrollments where id = p_enrollment_id for update;
  if v_e.id is null then
    raise exception 'enrollment not found' using errcode = 'P0002';
  end if;
  select * into v_membership from public.organization_memberships where id = v_e.membership_id;
  if v_membership.user_id is distinct from (select auth.uid()) then
    raise exception 'you can only record progress for your own enrollment' using errcode = '42501';
  end if;
  if v_membership.status <> 'active' then
    raise exception 'membership is not active' using errcode = '42501';
  end if;
  if v_e.status <> 'active' then
    raise exception 'enrollment is not active' using errcode = '23514';
  end if;

  select course_id into v_course_id from public.lessons where id = p_lesson_id;
  if v_course_id is null then
    raise exception 'lesson not found' using errcode = 'P0002';
  end if;

  -- the lesson's course must be covered by this enrollment
  if v_e.target_type = 'course' then
    if v_e.course_id <> v_course_id then
      raise exception 'lesson is outside this enrollment' using errcode = '42501';
    end if;
  else
    select pn.* into v_node from public.path_nodes pn
     where pn.path_id = v_e.learning_path_id and pn.course_id = v_course_id;
    if v_node.id is null then
      raise exception 'lesson is outside this enrollment' using errcode = '42501';
    end if;
    -- prerequisite gate (authoritative)
    select string_agg(c.title, ', ') into v_unmet
      from public.prerequisites p
      join public.path_nodes req on req.id = p.requires_node_id
      join public.courses c on c.id = req.course_id
     where p.node_id = v_node.id
       and not exists (
         select 1 from public.progress_records pr
          where pr.enrollment_id = p_enrollment_id
            and pr.course_id = req.course_id
            and pr.subject_type = 'course'
            and pr.status = 'completed'
       );
    if v_unmet is not null then
      raise exception 'locked by prerequisite: complete % first', v_unmet using errcode = '42501';
    end if;
  end if;

  -- course progress row (creates the per-course version pin at first start)
  select * into v_course_progress
    from public.progress_records
   where enrollment_id = p_enrollment_id and course_id = v_course_id
     and subject_type = 'course'
   for update;

  if v_course_progress.id is null then
    v_pin := coalesce(
      v_e.pinned_course_version_id,
      (select current_published_version_id from public.courses where id = v_course_id)
    );
    if v_pin is null then
      raise exception 'no published version is available for this course' using errcode = '23514';
    end if;
    insert into public.progress_records
      (organization_id, enrollment_id, subject_type, course_id, course_version_id, status)
    values
      (v_e.organization_id, p_enrollment_id, 'course', v_course_id, v_pin, 'in_progress')
    returning * into v_course_progress;

    update public.enrollments set started_at = coalesce(started_at, now())
     where id = p_enrollment_id;

    perform app.emit_event(
      v_e.organization_id, 'learning.course.started', 'course', v_course_id,
      jsonb_build_object('enrollment_id', p_enrollment_id, 'course_version_id', v_pin),
      '{}'::jsonb,
      'course-started:' || p_enrollment_id::text || ':' || v_course_id::text
    );
  end if;

  -- the lesson must exist inside the PINNED structure; pin its exact version
  select entry.value into v_entry
    from jsonb_path_query(
           (select structure from public.course_versions where id = v_course_progress.course_version_id),
           '$.modules[*].lessons[*]'
         ) as entry(value)
   where entry.value ->> 'lessonId' = p_lesson_id::text
   limit 1;
  if v_entry is null then
    raise exception 'this lesson is not part of your assigned version' using errcode = '23514';
  end if;
  v_lesson_version_id := (v_entry ->> 'lessonVersionId')::uuid;

  select * into v_existing
    from public.progress_records
   where enrollment_id = p_enrollment_id and lesson_id = p_lesson_id
   for update;

  if p_action = 'start' then
    if v_existing.id is null then
      insert into public.progress_records
        (organization_id, enrollment_id, subject_type, course_id, lesson_id,
         lesson_version_id, course_version_id, status)
      values
        (v_e.organization_id, p_enrollment_id, 'lesson', v_course_id, p_lesson_id,
         v_lesson_version_id, v_course_progress.course_version_id, 'in_progress');
      perform app.emit_event(
        v_e.organization_id, 'learning.lesson.started', 'lesson', p_lesson_id,
        jsonb_build_object('enrollment_id', p_enrollment_id,
                           'lesson_version_id', v_lesson_version_id,
                           'course_version_id', v_course_progress.course_version_id),
        '{}'::jsonb,
        'lesson-started:' || p_enrollment_id::text || ':' || p_lesson_id::text
      );
    end if;
    return;
  end if;

  -- complete (idempotent: repeat completions change nothing, emit nothing)
  if v_existing.id is not null and v_existing.status in ('completed', 'exempted') then
    return;
  end if;

  if v_existing.id is null then
    insert into public.progress_records
      (organization_id, enrollment_id, subject_type, course_id, lesson_id,
       lesson_version_id, course_version_id, status, completed_at)
    values
      (v_e.organization_id, p_enrollment_id, 'lesson', v_course_id, p_lesson_id,
       v_lesson_version_id, v_course_progress.course_version_id, 'completed', now());
  else
    update public.progress_records
       set status = 'completed', completed_at = now()
     where id = v_existing.id;
  end if;

  perform app.emit_event(
    v_e.organization_id, 'learning.lesson.completed', 'lesson', p_lesson_id,
    jsonb_build_object('enrollment_id', p_enrollment_id,
                       'lesson_version_id', v_lesson_version_id,
                       'course_version_id', v_course_progress.course_version_id),
    '{}'::jsonb,
    'lesson-completed:' || p_enrollment_id::text || ':' || p_lesson_id::text
  );

  perform app.evaluate_course_completion(p_enrollment_id, v_course_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- override_progress: permission-gated, audited manual override.
-- ---------------------------------------------------------------------------
create or replace function public.override_progress(
  p_enrollment_id uuid,
  p_lesson_id uuid,
  p_status text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_e record;
  v_course_id uuid;
  v_course_progress record;
  v_entry jsonb;
  v_lesson_version_id uuid;
  v_existing record;
  v_pin uuid;
begin
  if p_status not in ('completed', 'exempted') then
    raise exception 'invalid override status' using errcode = '22000';
  end if;
  if p_reason is null or char_length(trim(p_reason)) < 5 then
    raise exception 'an override reason is required' using errcode = '22000';
  end if;

  select * into v_e from public.enrollments where id = p_enrollment_id for update;
  if v_e.id is null then
    raise exception 'enrollment not found' using errcode = 'P0002';
  end if;
  if not app.has_org_permission(v_e.organization_id, 'progress.override') then
    raise exception 'permission denied: overrides require progress.override' using errcode = '42501';
  end if;

  select course_id into v_course_id from public.lessons where id = p_lesson_id;
  if v_course_id is null then
    raise exception 'lesson not found' using errcode = 'P0002';
  end if;

  select * into v_course_progress
    from public.progress_records
   where enrollment_id = p_enrollment_id and course_id = v_course_id and subject_type = 'course'
   for update;
  if v_course_progress.id is null then
    v_pin := coalesce(
      v_e.pinned_course_version_id,
      (select current_published_version_id from public.courses where id = v_course_id)
    );
    if v_pin is null then
      raise exception 'no published version is available for this course' using errcode = '23514';
    end if;
    insert into public.progress_records
      (organization_id, enrollment_id, subject_type, course_id, course_version_id, status)
    values (v_e.organization_id, p_enrollment_id, 'course', v_course_id, v_pin, 'in_progress')
    returning * into v_course_progress;
  end if;

  select entry.value into v_entry
    from jsonb_path_query(
           (select structure from public.course_versions where id = v_course_progress.course_version_id),
           '$.modules[*].lessons[*]'
         ) as entry(value)
   where entry.value ->> 'lessonId' = p_lesson_id::text
   limit 1;
  if v_entry is null then
    raise exception 'lesson is not part of the enrolled version' using errcode = '23514';
  end if;
  v_lesson_version_id := (v_entry ->> 'lessonVersionId')::uuid;

  select * into v_existing
    from public.progress_records
   where enrollment_id = p_enrollment_id and lesson_id = p_lesson_id
   for update;

  if v_existing.id is null then
    insert into public.progress_records
      (organization_id, enrollment_id, subject_type, course_id, lesson_id,
       lesson_version_id, course_version_id, status, completed_at,
       override_reason, overridden_by)
    values
      (v_e.organization_id, p_enrollment_id, 'lesson', v_course_id, p_lesson_id,
       v_lesson_version_id, v_course_progress.course_version_id, p_status,
       case when p_status = 'completed' then now() end,
       trim(p_reason), (select auth.uid()));
  else
    update public.progress_records
       set status = p_status,
           completed_at = case when p_status = 'completed' then now() else completed_at end,
           override_reason = trim(p_reason),
           overridden_by = (select auth.uid())
     where id = v_existing.id;
  end if;

  perform app.emit_event(
    v_e.organization_id, 'learning.progress.overridden', 'lesson', p_lesson_id,
    jsonb_build_object('enrollment_id', p_enrollment_id,
                       'lesson_version_id', v_lesson_version_id,
                       'status', p_status),
    jsonb_build_object('reason', trim(p_reason)),
    'progress-overridden:' || p_enrollment_id::text || ':' || p_lesson_id::text || ':' || extract(epoch from now())::text
  );

  perform app.evaluate_course_completion(p_enrollment_id, v_course_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- set_enrollment_status: withdraw/expire (enrollment.manage), audited.
-- ---------------------------------------------------------------------------
create or replace function public.set_enrollment_status(
  p_enrollment_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_e record;
begin
  if p_status not in ('active', 'withdrawn', 'expired') then
    raise exception 'invalid enrollment status' using errcode = '22000';
  end if;
  select * into v_e from public.enrollments where id = p_enrollment_id for update;
  if v_e.id is null then
    raise exception 'enrollment not found' using errcode = 'P0002';
  end if;
  if not app.has_org_permission(v_e.organization_id, 'enrollment.manage') then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  if v_e.status = 'completed' then
    raise exception 'completed enrollments are evidence and cannot change status' using errcode = '23514';
  end if;

  update public.enrollments set status = p_status where id = p_enrollment_id;

  if p_status = 'withdrawn' then
    perform app.emit_event(
      v_e.organization_id, 'enrollment.learner.withdrawn', 'enrollment', p_enrollment_id,
      '{}'::jsonb, '{}'::jsonb,
      'enrollment-withdrawn:' || p_enrollment_id::text || ':' || extract(epoch from now())::text
    );
  end if;
end;
$$;

-- Execution grants: authenticated only (each function authorizes internally).
revoke all on function public.publish_lesson(uuid) from public, anon;
revoke all on function public.publish_course(uuid) from public, anon;
revoke all on function public.create_enrollment(uuid, text, uuid, text) from public, anon;
revoke all on function public.record_lesson_progress(uuid, uuid, text) from public, anon;
revoke all on function public.override_progress(uuid, uuid, text, text) from public, anon;
revoke all on function public.set_enrollment_status(uuid, text) from public, anon;
grant execute on function public.publish_lesson(uuid) to authenticated;
grant execute on function public.publish_course(uuid) to authenticated;
grant execute on function public.create_enrollment(uuid, text, uuid, text) to authenticated;
grant execute on function public.record_lesson_progress(uuid, uuid, text) to authenticated;
grant execute on function public.override_progress(uuid, uuid, text, text) to authenticated;
grant execute on function public.set_enrollment_status(uuid, text) to authenticated;
