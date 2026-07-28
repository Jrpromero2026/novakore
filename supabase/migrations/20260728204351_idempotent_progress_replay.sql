-- Repeated completion calls on a COMPLETED enrollment must be idempotent
-- no-ops (found by the learning isolation suite). Withdrawn/expired remain
-- blocked; new progress still requires an active enrollment.
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
  if v_e.status not in ('active', 'completed') then
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
    if v_e.status <> 'active' then
      raise exception 'enrollment is not active' using errcode = '23514';
    end if;
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
    if v_existing.id is null and v_e.status = 'active' then
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

  -- complete: idempotent replay (already completed/exempted) is a no-op
  if v_existing.id is not null and v_existing.status in ('completed', 'exempted') then
    return;
  end if;
  if v_e.status <> 'active' then
    raise exception 'enrollment is not active' using errcode = '23514';
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
