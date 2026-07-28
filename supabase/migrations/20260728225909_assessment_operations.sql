-- NovaKore Phase 1D — assessment transactional operations.
-- Every RPC is SECURITY DEFINER with empty search_path, deny-by-default
-- internal authorization, and emits its analytics/outbox rows via
-- app.emit_event inside the SAME transaction (ADR-018). Grading is
-- server-authoritative; correct-answer configuration never crosses to the
-- learner (get_assessment_attempt_payload builds an allowlisted view).

-- ---------------------------------------------------------------------------
-- publish_assessment: freeze validated draft items + settings.
-- The app layer deep-validates each item against the domain registry before
-- calling; this function enforces the structural invariants.
-- ---------------------------------------------------------------------------
create or replace function public.publish_assessment(p_assessment_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_a record;
  v_items jsonb;
  v_next integer;
  v_version_id uuid;
begin
  select * into v_a from public.assessments where id = p_assessment_id for update;
  if v_a.id is null then
    raise exception 'assessment not found' using errcode = 'P0002';
  end if;
  if not app.has_org_permission(v_a.organization_id, 'assessment.publish') then
    raise exception 'permission denied: publishing requires assessment.publish' using errcode = '42501';
  end if;
  if v_a.archived_at is not null then
    raise exception 'archived assessments cannot be published' using errcode = '23514';
  end if;

  select jsonb_agg(
           jsonb_build_object(
             'id', i.id, 'type', i.item_type, 'schemaVersion', i.schema_version,
             'data', i.data, 'position', i.position, 'required', i.required
           ) order by i.position
         )
    into v_items
    from public.assessment_items i
   where i.assessment_id = p_assessment_id;

  if v_items is null or jsonb_array_length(v_items) = 0 then
    raise exception 'an assessment needs at least one item to publish' using errcode = '23514';
  end if;

  select coalesce(max(version_number), 0) + 1 into v_next
    from public.assessment_versions where assessment_id = p_assessment_id;

  insert into public.assessment_versions
    (organization_id, assessment_id, version_number, title, settings, items, published_by)
  values
    (v_a.organization_id, v_a.id, v_next, v_a.title, v_a.settings, v_items, (select auth.uid()))
  returning id into v_version_id;

  update public.assessments
     set current_published_version_id = v_version_id, status = 'published'
   where id = p_assessment_id;

  perform app.emit_event(
    v_a.organization_id, 'content.assessment.published', 'assessment', v_a.id,
    jsonb_build_object('assessment_version_id', v_version_id),
    jsonb_build_object('version_number', v_next),
    'assessment-published:' || v_version_id::text
  );
  return v_version_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- assign_assessment: pin the CURRENT published version to a lesson.
-- Re-pinning to a newer version = archive + assign again (documented).
-- ---------------------------------------------------------------------------
create or replace function public.assign_assessment(
  p_lesson_id uuid,
  p_assessment_id uuid,
  p_required boolean default true,
  p_completion_effect text default 'complete_lesson'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lesson record;
  v_a record;
  v_assignment_id uuid;
begin
  if p_completion_effect not in ('complete_lesson', 'none') then
    raise exception 'invalid completion effect' using errcode = '22000';
  end if;
  select * into v_lesson from public.lessons where id = p_lesson_id;
  if v_lesson.id is null then
    raise exception 'lesson not found' using errcode = 'P0002';
  end if;
  if not app.has_org_permission(v_lesson.organization_id, 'assessment.assign') then
    raise exception 'permission denied: attaching requires assessment.assign' using errcode = '42501';
  end if;
  select * into v_a from public.assessments
   where id = p_assessment_id and organization_id = v_lesson.organization_id;
  if v_a.id is null then
    raise exception 'assessment not found in this organization' using errcode = 'P0002';
  end if;
  if v_a.current_published_version_id is null then
    raise exception 'the assessment has no published version to assign' using errcode = '23514';
  end if;

  insert into public.assessment_assignments
    (organization_id, course_id, lesson_id, assessment_id, assessment_version_id,
     required, completion_effect, created_by)
  values
    (v_lesson.organization_id, v_lesson.course_id, p_lesson_id, p_assessment_id,
     v_a.current_published_version_id, p_required, p_completion_effect, (select auth.uid()))
  returning id into v_assignment_id;

  perform app.emit_event(
    v_lesson.organization_id, 'assessment.assignment.created', 'assessment_assignment', v_assignment_id,
    jsonb_build_object('lesson_id', p_lesson_id, 'assessment_id', p_assessment_id,
                       'assessment_version_id', v_a.current_published_version_id),
    jsonb_build_object('required', p_required, 'completion_effect', p_completion_effect),
    'assessment-assigned:' || v_assignment_id::text
  );
  return v_assignment_id;
end;
$$;

create or replace function public.set_assessment_assignment_status(
  p_assignment_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row record;
begin
  if p_status not in ('active', 'archived') then
    raise exception 'invalid assignment status' using errcode = '22000';
  end if;
  select * into v_row from public.assessment_assignments where id = p_assignment_id for update;
  if v_row.id is null then
    raise exception 'assignment not found' using errcode = 'P0002';
  end if;
  if not app.has_org_permission(v_row.organization_id, 'assessment.assign') then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  update public.assessment_assignments set status = p_status where id = p_assignment_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Internal: does this enrollment cover this course (direct or via a path)?
-- ---------------------------------------------------------------------------
create or replace function app.enrollment_covers_course(p_enrollment public.enrollments, p_course_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_enrollment.course_id = p_course_id
      or (p_enrollment.learning_path_id is not null and exists (
            select 1 from public.path_nodes pn
            where pn.path_id = p_enrollment.learning_path_id
              and pn.course_id = p_course_id
          ));
$$;
revoke all on function app.enrollment_covers_course(public.enrollments, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- start_assessment_attempt
-- ---------------------------------------------------------------------------
create or replace function public.start_assessment_attempt(
  p_assignment_id uuid,
  p_enrollment_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_asg record;
  v_e record;
  v_m record;
  v_settings jsonb;
  v_max integer;
  v_cooldown integer;
  v_passing integer;
  v_time_limit integer;
  v_counted integer;
  v_latest timestamptz;
  v_attempt_id uuid;
  v_number integer;
begin
  select * into v_asg from public.assessment_assignments where id = p_assignment_id;
  if v_asg.id is null or v_asg.status <> 'active' then
    raise exception 'assignment not found or archived' using errcode = 'P0002';
  end if;
  if (v_asg.available_from is not null and now() < v_asg.available_from)
     or (v_asg.available_until is not null and now() > v_asg.available_until) then
    raise exception 'this assessment is not currently available' using errcode = '23514';
  end if;

  select * into v_e from public.enrollments where id = p_enrollment_id for update;
  if v_e.id is null or v_e.organization_id <> v_asg.organization_id then
    raise exception 'enrollment not found' using errcode = 'P0002';
  end if;
  select * into v_m from public.organization_memberships where id = v_e.membership_id;
  if v_m.user_id is distinct from (select auth.uid()) then
    raise exception 'you can only attempt with your own enrollment' using errcode = '42501';
  end if;
  if v_m.status <> 'active' or v_e.status <> 'active' then
    raise exception 'enrollment is not active' using errcode = '23514';
  end if;
  if not app.enrollment_covers_course(v_e, v_asg.course_id) then
    raise exception 'this assessment is outside your enrollment' using errcode = '42501';
  end if;

  select settings into v_settings
    from public.assessment_versions where id = v_asg.assessment_version_id;
  v_passing := coalesce((v_settings ->> 'passingPercent')::integer, 70);
  v_time_limit := (v_settings ->> 'timeLimitMinutes')::integer;
  v_max := (v_settings ->> 'maxAttempts')::integer;
  v_cooldown := coalesce((v_settings ->> 'cooldownMinutes')::integer, 0);

  -- retake gate (authoritative twin of the domain computation)
  if exists (select 1 from public.assessment_attempts a
             where a.assignment_id = p_assignment_id and a.enrollment_id = p_enrollment_id
               and a.status in ('started', 'submitted', 'pending_review')) then
    raise exception 'an attempt is already in progress' using errcode = '23514';
  end if;
  if exists (select 1 from public.assessment_attempts a
             where a.assignment_id = p_assignment_id and a.enrollment_id = p_enrollment_id
               and a.status = 'passed') then
    raise exception 'you have already passed this assessment' using errcode = '23514';
  end if;
  select count(*) filter (where status <> 'abandoned'), max(finalized_at)
    into v_counted, v_latest
    from public.assessment_attempts a
   where a.assignment_id = p_assignment_id and a.enrollment_id = p_enrollment_id;
  if v_max is not null and v_counted >= v_max then
    raise exception 'the attempt limit (%) has been reached', v_max using errcode = '23514';
  end if;
  if v_cooldown > 0 and v_latest is not null and now() < v_latest + make_interval(mins => v_cooldown) then
    raise exception 'retake available after the cooldown (% min)', v_cooldown using errcode = '23514';
  end if;

  select coalesce(max(attempt_number), 0) + 1 into v_number
    from public.assessment_attempts a
   where a.assignment_id = p_assignment_id and a.enrollment_id = p_enrollment_id;

  insert into public.assessment_attempts
    (organization_id, assignment_id, enrollment_id, membership_id, assessment_id,
     assessment_version_id, course_id, lesson_id, attempt_number,
     time_limit_minutes, expires_at, passing_percent)
  values
    (v_asg.organization_id, p_assignment_id, p_enrollment_id, v_e.membership_id,
     v_asg.assessment_id, v_asg.assessment_version_id, v_asg.course_id, v_asg.lesson_id,
     v_number, v_time_limit,
     case when v_time_limit is not null then now() + make_interval(mins => v_time_limit) end,
     v_passing)
  returning id into v_attempt_id;

  perform app.emit_event(
    v_asg.organization_id, 'assessment.attempt.started', 'assessment_attempt', v_attempt_id,
    jsonb_build_object('assignment_id', p_assignment_id, 'enrollment_id', p_enrollment_id,
                       'assessment_version_id', v_asg.assessment_version_id),
    jsonb_build_object('attempt_number', v_number),
    'attempt-started:' || v_attempt_id::text
  );
  return v_attempt_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- get_assessment_attempt_payload: the ONLY learner path to item content.
-- Constructive allowlist — correct-answer config, feedback, and rubrics
-- are never selected, mirroring the domain's toLearnerItemView.
-- ---------------------------------------------------------------------------
create or replace function public.get_assessment_attempt_payload(p_attempt_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_at record;
  v_version record;
  v_owner boolean;
  v_items jsonb;
  v_responses jsonb;
begin
  select * into v_at from public.assessment_attempts where id = p_attempt_id;
  if v_at.id is null then
    raise exception 'attempt not found' using errcode = 'P0002';
  end if;
  select exists (
    select 1 from public.organization_memberships m
    where m.id = v_at.membership_id and m.user_id = (select auth.uid())
  ) into v_owner;
  if not v_owner and not app.has_org_permission(v_at.organization_id, 'assessment.grade') then
    raise exception 'permission denied' using errcode = '42501';
  end if;

  select * into v_version from public.assessment_versions where id = v_at.assessment_version_id;

  select jsonb_agg(
           jsonb_strip_nulls(jsonb_build_object(
             'id', item -> 'id',
             'type', item -> 'type',
             'position', item -> 'position',
             'required', item -> 'required',
             'prompt', item -> 'data' -> 'prompt',
             'instructions', item -> 'data' -> 'instructions',
             'points', item -> 'data' -> 'points',
             'maxLength', item -> 'data' -> 'maxLength',
             'options', case
               when item ->> 'type' in ('multiple_choice', 'multiple_select') then (
                 select jsonb_agg(jsonb_build_object('id', o -> 'id', 'text', o -> 'text'))
                 from jsonb_array_elements(item -> 'data' -> 'options') o
               )
             end,
             'uploadDeferred', case when item ->> 'type' = 'file_submission' then to_jsonb(true) end
           )) order by item ->> 'position'
         )
    into v_items
    from jsonb_array_elements(v_version.items) item;

  select coalesce(jsonb_object_agg(r.item_id::text, r.response), '{}'::jsonb)
    into v_responses
    from public.assessment_responses r
   where r.attempt_id = p_attempt_id;

  return jsonb_build_object(
    'attemptId', v_at.id,
    'status', v_at.status,
    'attemptNumber', v_at.attempt_number,
    'startedAt', v_at.started_at,
    'expiresAt', v_at.expires_at,
    'timeLimitMinutes', v_at.time_limit_minutes,
    'passingPercent', v_at.passing_percent,
    'title', v_version.title,
    'versionNumber', v_version.version_number,
    'items', coalesce(v_items, '[]'::jsonb),
    'responses', v_responses
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- save_assessment_response (draft saving; no events — keystroke noise)
-- ---------------------------------------------------------------------------
create or replace function public.save_assessment_response(
  p_attempt_id uuid,
  p_item_id uuid,
  p_response jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_at record;
  v_item jsonb;
begin
  if p_response is null or jsonb_typeof(p_response) <> 'object' then
    raise exception 'invalid response payload' using errcode = '22000';
  end if;
  select * into v_at from public.assessment_attempts where id = p_attempt_id for update;
  if v_at.id is null then
    raise exception 'attempt not found' using errcode = 'P0002';
  end if;
  if not exists (
    select 1 from public.organization_memberships m
    where m.id = v_at.membership_id and m.user_id = (select auth.uid()) and m.status = 'active'
  ) then
    raise exception 'you can only answer your own attempt' using errcode = '42501';
  end if;
  if v_at.status <> 'started' then
    raise exception 'responses are locked after submission' using errcode = '23514';
  end if;
  if v_at.expires_at is not null and now() > v_at.expires_at + interval '30 seconds' then
    raise exception 'the time limit for this attempt has passed' using errcode = '23514';
  end if;

  select item into v_item
    from jsonb_array_elements(
           (select items from public.assessment_versions where id = v_at.assessment_version_id)
         ) item
   where item ->> 'id' = p_item_id::text
   limit 1;
  if v_item is null then
    raise exception 'item is not part of this attempt''s version' using errcode = '23514';
  end if;

  insert into public.assessment_responses
    (organization_id, attempt_id, item_id, item_type, response)
  values
    (v_at.organization_id, p_attempt_id, p_item_id, v_item ->> 'type', p_response)
  on conflict (attempt_id, item_id)
  do update set response = excluded.response;
end;
$$;

-- ---------------------------------------------------------------------------
-- Internal deterministic grading (authoritative twin of the domain
-- gradeResponse / computeAttemptOutcome functions).
-- ---------------------------------------------------------------------------
create or replace function app.grade_objective_response(p_item jsonb, p_response jsonb)
returns table (points_earned numeric, correct boolean)
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_type text := p_item ->> 'type';
  v_max numeric := (p_item -> 'data' ->> 'points')::numeric;
  v_correct_set jsonb;
  v_chosen jsonb;
  v_total_correct integer;
  v_chosen_correct integer;
  v_chosen_incorrect integer;
  v_partial boolean;
  v_ratio numeric;
begin
  if v_type = 'multiple_choice' then
    correct := (p_response ->> 'optionId') = (p_item -> 'data' ->> 'correctOptionId');
    points_earned := case when correct then v_max else 0 end;
    return next;
    return;
  end if;
  if v_type = 'true_false' then
    correct := (p_response -> 'value') = (p_item -> 'data' -> 'correctValue');
    points_earned := case when correct then v_max else 0 end;
    return next;
    return;
  end if;
  if v_type = 'multiple_select' then
    v_correct_set := p_item -> 'data' -> 'correctOptionIds';
    v_chosen := coalesce(p_response -> 'optionIds', '[]'::jsonb);
    v_total_correct := jsonb_array_length(v_correct_set);
    select count(*) into v_chosen_correct
      from jsonb_array_elements_text(v_chosen) c
     where v_correct_set ? c;
    v_chosen_incorrect := jsonb_array_length(v_chosen) - v_chosen_correct;
    correct := v_chosen_incorrect = 0 and v_chosen_correct = v_total_correct;
    v_partial := coalesce((p_item -> 'data' ->> 'partialCredit')::boolean, false);
    if correct then
      points_earned := v_max;
    elsif v_partial then
      v_ratio := greatest(0, (v_chosen_correct - v_chosen_incorrect)::numeric / v_total_correct);
      points_earned := round(least(v_max * v_ratio, v_max), 2);
    else
      points_earned := 0;
    end if;
    return next;
    return;
  end if;
  raise exception 'not an objective item type: %', v_type using errcode = '22000';
end;
$$;
revoke all on function app.grade_objective_response(jsonb, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Internal: apply a passed attempt's completion effect + credentials.
-- Also called from the review path (caller is the reviewer, so lesson
-- completion cannot go through the learner-bound record_lesson_progress).
-- ---------------------------------------------------------------------------
create or replace function app.apply_assessment_outcome(p_attempt_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_at record;
  v_asg record;
  v_e record;
  v_course_progress record;
  v_pin uuid;
  v_entry jsonb;
  v_lesson_version_id uuid;
  v_existing record;
  v_cert record;
begin
  select * into v_at from public.assessment_attempts where id = p_attempt_id;
  if v_at.status <> 'passed' then
    return;
  end if;
  select * into v_asg from public.assessment_assignments where id = v_at.assignment_id;

  if v_asg.completion_effect = 'complete_lesson' then
    select * into v_e from public.enrollments where id = v_at.enrollment_id for update;

    -- course-level progress row (pin chain, mirrors record_lesson_progress)
    select * into v_course_progress
      from public.progress_records
     where enrollment_id = v_at.enrollment_id and course_id = v_at.course_id
       and subject_type = 'course'
     for update;
    if v_course_progress.id is null then
      v_pin := coalesce(
        v_e.pinned_course_version_id,
        (select current_published_version_id from public.courses where id = v_at.course_id)
      );
      if v_pin is not null then
        insert into public.progress_records
          (organization_id, enrollment_id, subject_type, course_id, course_version_id, status)
        values
          (v_e.organization_id, v_at.enrollment_id, 'course', v_at.course_id, v_pin, 'in_progress')
        returning * into v_course_progress;
        update public.enrollments set started_at = coalesce(started_at, now())
         where id = v_at.enrollment_id;
      end if;
    end if;

    if v_course_progress.id is not null then
      select entry.value into v_entry
        from jsonb_path_query(
               (select structure from public.course_versions where id = v_course_progress.course_version_id),
               '$.modules[*].lessons[*]'
             ) as entry(value)
       where entry.value ->> 'lessonId' = v_at.lesson_id::text
       limit 1;
      if v_entry is not null then
        v_lesson_version_id := (v_entry ->> 'lessonVersionId')::uuid;
        select * into v_existing
          from public.progress_records
         where enrollment_id = v_at.enrollment_id and lesson_id = v_at.lesson_id
         for update;
        if v_existing.id is null then
          insert into public.progress_records
            (organization_id, enrollment_id, subject_type, course_id, lesson_id,
             lesson_version_id, course_version_id, status, completed_at)
          values
            (v_at.organization_id, v_at.enrollment_id, 'lesson', v_at.course_id, v_at.lesson_id,
             v_lesson_version_id, v_course_progress.course_version_id, 'completed', now());
        elsif v_existing.status not in ('completed', 'exempted') then
          update public.progress_records
             set status = 'completed', completed_at = now()
           where id = v_existing.id;
        end if;

        perform app.emit_event(
          v_at.organization_id, 'learning.completion.triggered_by_assessment', 'lesson', v_at.lesson_id,
          jsonb_build_object('enrollment_id', v_at.enrollment_id, 'attempt_id', v_at.id,
                             'assessment_version_id', v_at.assessment_version_id),
          '{}'::jsonb,
          'assessment-completion:' || v_at.id::text
        );
        -- same idempotency key as the learner path: exactly-once lesson completion
        perform app.emit_event(
          v_at.organization_id, 'learning.lesson.completed', 'lesson', v_at.lesson_id,
          jsonb_build_object('enrollment_id', v_at.enrollment_id,
                             'lesson_version_id', v_lesson_version_id,
                             'course_version_id', v_course_progress.course_version_id),
          '{}'::jsonb,
          'lesson-completed:' || v_at.enrollment_id::text || ':' || v_at.lesson_id::text
        );
        perform app.evaluate_course_completion(v_at.enrollment_id, v_at.course_id);
      end if;
    end if;
  end if;

  -- assignment-sourced credentials
  for v_cert in
    select * from public.certificates c
    where c.assignment_id = v_at.assignment_id and c.status = 'active'
  loop
    perform app.issue_credential_internal(
      v_cert.id, v_at.membership_id, v_at.enrollment_id, null, v_at.id, null);
  end loop;
end;
$$;
revoke all on function app.apply_assessment_outcome(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- submit_assessment_attempt: idempotent finalization with server grading
-- ---------------------------------------------------------------------------
create or replace function public.submit_assessment_attempt(p_attempt_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_at record;
  v_version record;
  v_item jsonb;
  v_response record;
  v_grade record;
  v_earned numeric := 0;
  v_possible numeric := 0;
  v_needs_review boolean := false;
  v_percent numeric;
  v_status text;
begin
  select * into v_at from public.assessment_attempts where id = p_attempt_id for update;
  if v_at.id is null then
    raise exception 'attempt not found' using errcode = 'P0002';
  end if;
  if not exists (
    select 1 from public.organization_memberships m
    where m.id = v_at.membership_id and m.user_id = (select auth.uid()) and m.status = 'active'
  ) then
    raise exception 'you can only submit your own attempt' using errcode = '42501';
  end if;
  -- idempotent: submitting a non-started attempt changes nothing
  if v_at.status <> 'started' then
    return;
  end if;
  -- clear expiration behavior: late submission finalizes as expired (no score)
  if v_at.expires_at is not null and now() > v_at.expires_at + interval '30 seconds' then
    update public.assessment_attempts
       set status = 'expired', finalized_at = now()
     where id = p_attempt_id;
    return;
  end if;

  select * into v_version from public.assessment_versions where id = v_at.assessment_version_id;

  for v_item in select item from jsonb_array_elements(v_version.items) item
  loop
    v_possible := v_possible + (v_item -> 'data' ->> 'points')::numeric;
    select * into v_response from public.assessment_responses r
     where r.attempt_id = p_attempt_id and r.item_id = (v_item ->> 'id')::uuid;

    if (v_item ->> 'type') in ('multiple_choice', 'multiple_select', 'true_false') then
      if v_response.id is null then
        continue; -- unanswered objective scores zero
      end if;
      select * into v_grade from app.grade_objective_response(v_item, v_response.response);
      v_earned := v_earned + v_grade.points_earned;
      update public.assessment_responses
         set points_possible = (v_item -> 'data' ->> 'points')::numeric,
             points_earned = v_grade.points_earned,
             correct = v_grade.correct,
             needs_review = false
       where id = v_response.id;
    else
      -- subjective: answered → review; unanswered REQUIRED → review anyway
      if v_response.id is not null then
        v_needs_review := true;
        update public.assessment_responses
           set points_possible = (v_item -> 'data' ->> 'points')::numeric,
               points_earned = 0,
               correct = null,
               needs_review = true
         where id = v_response.id;
      elsif (v_item -> 'required')::boolean then
        v_needs_review := true;
      end if;
    end if;
  end loop;

  v_percent := case when v_possible = 0 then 0
               else round((v_earned / v_possible) * 100, 2) end;

  perform app.emit_event(
    v_at.organization_id, 'assessment.attempt.submitted', 'assessment_attempt', v_at.id,
    jsonb_build_object('assessment_version_id', v_at.assessment_version_id,
                       'enrollment_id', v_at.enrollment_id),
    jsonb_build_object('attempt_number', v_at.attempt_number),
    'attempt-submitted:' || v_at.id::text
  );

  if v_needs_review then
    update public.assessment_attempts
       set status = 'pending_review', submitted_at = now(),
           points_earned = round(v_earned, 2), points_possible = v_possible,
           score_percent = v_percent
     where id = p_attempt_id;
    insert into public.assessment_reviews (organization_id, attempt_id)
    values (v_at.organization_id, p_attempt_id)
    on conflict (attempt_id) do nothing;
    perform app.emit_event(
      v_at.organization_id, 'assessment.attempt.pending_review', 'assessment_attempt', v_at.id,
      jsonb_build_object('assessment_version_id', v_at.assessment_version_id),
      '{}'::jsonb,
      'attempt-pending-review:' || v_at.id::text
    );
    return;
  end if;

  v_status := case when v_percent >= v_at.passing_percent then 'passed' else 'failed' end;
  update public.assessment_attempts
     set status = v_status, submitted_at = now(), finalized_at = now(),
         points_earned = round(v_earned, 2), points_possible = v_possible,
         score_percent = v_percent
   where id = p_attempt_id;

  perform app.emit_event(
    v_at.organization_id,
    case when v_status = 'passed' then 'assessment.attempt.passed' else 'assessment.attempt.failed' end,
    'assessment_attempt', v_at.id,
    jsonb_build_object('assessment_version_id', v_at.assessment_version_id,
                       'enrollment_id', v_at.enrollment_id),
    jsonb_build_object('score_percent', v_percent, 'attempt_number', v_at.attempt_number),
    'attempt-finalized:' || v_at.id::text
  );

  if v_status = 'passed' then
    perform app.apply_assessment_outcome(p_attempt_id);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Review workflow: claim + complete (assessment.grade; never self-review)
-- ---------------------------------------------------------------------------
create or replace function public.claim_assessment_review(p_attempt_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rev record;
begin
  select * into v_rev from public.assessment_reviews where attempt_id = p_attempt_id for update;
  if v_rev.id is null then
    raise exception 'review not found' using errcode = 'P0002';
  end if;
  if not app.has_org_permission(v_rev.organization_id, 'assessment.grade') then
    raise exception 'permission denied: reviewing requires assessment.grade' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.assessment_attempts a
    join public.organization_memberships m on m.id = a.membership_id
    where a.id = p_attempt_id and m.user_id = (select auth.uid())
  ) then
    raise exception 'you cannot review your own attempt' using errcode = '42501';
  end if;
  if v_rev.status = 'completed' then
    raise exception 'this review is already completed' using errcode = '23514';
  end if;
  update public.assessment_reviews
     set status = 'in_review', reviewer_id = (select auth.uid()), claimed_at = now()
   where id = v_rev.id;
end;
$$;

create or replace function public.complete_assessment_review(
  p_attempt_id uuid,
  p_item_scores jsonb,      -- { "<item uuid>": points, ... }
  p_item_feedback jsonb,    -- { "<item uuid>": "text", ... } (optional entries)
  p_overall_feedback text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rev record;
  v_at record;
  v_version record;
  v_item jsonb;
  v_earned numeric := 0;
  v_possible numeric := 0;
  v_score numeric;
  v_max numeric;
  v_grade record;
  v_response record;
  v_percent numeric;
  v_status text;
begin
  if p_item_scores is null or jsonb_typeof(p_item_scores) <> 'object' then
    raise exception 'item scores are required' using errcode = '22000';
  end if;
  if p_overall_feedback is not null and char_length(p_overall_feedback) > 5000 then
    raise exception 'overall feedback is too long' using errcode = '22000';
  end if;

  select * into v_rev from public.assessment_reviews where attempt_id = p_attempt_id for update;
  if v_rev.id is null then
    raise exception 'review not found' using errcode = 'P0002';
  end if;
  if not app.has_org_permission(v_rev.organization_id, 'assessment.grade') then
    raise exception 'permission denied: reviewing requires assessment.grade' using errcode = '42501';
  end if;
  if v_rev.status = 'completed' then
    raise exception 'this review is already completed' using errcode = '23514';
  end if;
  select * into v_at from public.assessment_attempts where id = p_attempt_id for update;
  if v_at.status <> 'pending_review' then
    raise exception 'the attempt is not awaiting review' using errcode = '23514';
  end if;
  if exists (
    select 1 from public.organization_memberships m
    where m.id = v_at.membership_id and m.user_id = (select auth.uid())
  ) then
    raise exception 'you cannot review your own attempt' using errcode = '42501';
  end if;

  select * into v_version from public.assessment_versions where id = v_at.assessment_version_id;

  for v_item in select item from jsonb_array_elements(v_version.items) item
  loop
    v_max := (v_item -> 'data' ->> 'points')::numeric;
    v_possible := v_possible + v_max;
    select * into v_response from public.assessment_responses r
     where r.attempt_id = p_attempt_id and r.item_id = (v_item ->> 'id')::uuid;

    if (v_item ->> 'type') in ('multiple_choice', 'multiple_select', 'true_false') then
      -- objective grades are already final; regrade deterministically for totals
      if v_response.id is not null then
        select * into v_grade from app.grade_objective_response(v_item, v_response.response);
        v_earned := v_earned + v_grade.points_earned;
      end if;
    else
      v_score := (p_item_scores ->> (v_item ->> 'id'))::numeric;
      if v_score is null then
        -- unanswered optional items may be skipped; answered ones must be scored
        if v_response.id is not null or (v_item -> 'required')::boolean then
          raise exception 'a score is required for item %', v_item ->> 'id' using errcode = '22000';
        end if;
        continue;
      end if;
      if v_score < 0 or v_score > v_max then
        raise exception 'score for item % must be between 0 and %', v_item ->> 'id', v_max
          using errcode = '22000';
      end if;
      v_earned := v_earned + v_score;
      if v_response.id is not null then
        update public.assessment_responses
           set reviewed_points = v_score,
               points_earned = v_score,
               needs_review = false,
               reviewer_feedback = left(p_item_feedback ->> (v_item ->> 'id'), 2000)
         where id = v_response.id;
      end if;
    end if;
  end loop;

  v_percent := case when v_possible = 0 then 0
               else round((v_earned / v_possible) * 100, 2) end;
  v_status := case when v_percent >= v_at.passing_percent then 'passed' else 'failed' end;

  update public.assessment_attempts
     set status = v_status, finalized_at = now(),
         points_earned = round(v_earned, 2), points_possible = v_possible,
         score_percent = v_percent
   where id = p_attempt_id;

  update public.assessment_reviews
     set status = 'completed', decision = v_status, completed_at = now(),
         reviewer_id = (select auth.uid()),
         overall_feedback = p_overall_feedback
   where id = v_rev.id;

  perform app.emit_event(
    v_rev.organization_id, 'assessment.review.completed', 'assessment_attempt', p_attempt_id,
    jsonb_build_object('assessment_version_id', v_at.assessment_version_id),
    jsonb_build_object('decision', v_status),
    'review-completed:' || v_rev.id::text
  );
  perform app.emit_event(
    v_at.organization_id,
    case when v_status = 'passed' then 'assessment.attempt.passed' else 'assessment.attempt.failed' end,
    'assessment_attempt', v_at.id,
    jsonb_build_object('assessment_version_id', v_at.assessment_version_id,
                       'enrollment_id', v_at.enrollment_id),
    jsonb_build_object('score_percent', v_percent, 'attempt_number', v_at.attempt_number),
    'attempt-finalized:' || v_at.id::text
  );

  if v_status = 'passed' then
    perform app.apply_assessment_outcome(p_attempt_id);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Credentials: internal issuance + manual issue/revoke + public verification
-- ---------------------------------------------------------------------------
create or replace function app.issue_credential_internal(
  p_certificate_id uuid,
  p_membership_id uuid,
  p_enrollment_id uuid,
  p_course_version_id uuid,
  p_attempt_id uuid,
  p_recipient_name text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cert record;
  v_template record;
  v_name text;
  v_code text;
  v_expires timestamptz;
  v_id uuid;
begin
  select * into v_cert from public.certificates where id = p_certificate_id;
  if v_cert.id is null or v_cert.status <> 'active' then
    return null;
  end if;
  select * into v_template from public.certificate_templates where id = v_cert.template_id;
  if v_template.id is null or v_template.status <> 'active' then
    return null;
  end if;

  v_name := nullif(trim(coalesce(p_recipient_name, '')), '');
  if v_name is null then
    select coalesce(split_part(u.email, '@', 1), 'Learner') into v_name
      from public.organization_memberships m
      join auth.users u on u.id = m.user_id
     where m.id = p_membership_id;
  end if;

  v_code := 'NVK-' || (
    select string_agg(upper(substr(h, (g - 1) * 4 + 1, 4)), '-' order by g)
    from (select encode(extensions.gen_random_bytes(8), 'hex') as h) hex,
         generate_series(1, 4) g
  );
  if (v_template.template ->> 'expirationMonths') is not null then
    v_expires := now() + make_interval(months => (v_template.template ->> 'expirationMonths')::integer);
  end if;

  insert into public.issued_credentials
    (organization_id, certificate_id, membership_id, recipient_name, title,
     template_snapshot, verification_code, issued_by, expires_at,
     enrollment_id, course_version_id, attempt_id)
  values
    (v_cert.organization_id, p_certificate_id, p_membership_id, v_name, v_cert.title,
     v_template.template, v_code,
     case when p_recipient_name is not null then (select auth.uid()) end,
     v_expires, p_enrollment_id, p_course_version_id, p_attempt_id)
  on conflict (certificate_id, membership_id) where (status <> 'revoked') do nothing
  returning id into v_id;

  if v_id is null then
    return null; -- already issued: idempotent, no event
  end if;

  perform app.emit_event(
    v_cert.organization_id, 'credential.certificate.issued', 'issued_credential', v_id,
    jsonb_build_object('certificate_id', p_certificate_id, 'membership_id', p_membership_id,
                       'attempt_id', p_attempt_id),
    jsonb_build_object('title', v_cert.title),
    'credential-issued:' || p_certificate_id::text || ':' || p_membership_id::text
  );
  return v_id;
end;
$$;
revoke all on function app.issue_credential_internal(uuid, uuid, uuid, uuid, uuid, text) from public, anon, authenticated;

-- Course/path completion now also issues matching credentials.
create or replace function app.issue_credentials_for_completion(
  p_enrollment_id uuid,
  p_course_id uuid,
  p_course_version_id uuid,
  p_path_completed boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_e record;
  v_cert record;
begin
  select * into v_e from public.enrollments where id = p_enrollment_id;
  for v_cert in
    select * from public.certificates c
    where c.status = 'active' and c.course_id = p_course_id
  loop
    perform app.issue_credential_internal(
      v_cert.id, v_e.membership_id, p_enrollment_id, p_course_version_id, null, null);
  end loop;
  if p_path_completed and v_e.learning_path_id is not null then
    for v_cert in
      select * from public.certificates c
      where c.status = 'active' and c.learning_path_id = v_e.learning_path_id
    loop
      perform app.issue_credential_internal(
        v_cert.id, v_e.membership_id, p_enrollment_id, null, null, null);
    end loop;
  end if;
end;
$$;
revoke all on function app.issue_credentials_for_completion(uuid, uuid, uuid, boolean) from public, anon, authenticated;

create or replace function public.issue_credential(
  p_certificate_id uuid,
  p_membership_id uuid,
  p_recipient_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cert record;
  v_m record;
  v_id uuid;
begin
  select * into v_cert from public.certificates where id = p_certificate_id;
  if v_cert.id is null then
    raise exception 'certificate not found' using errcode = 'P0002';
  end if;
  if not app.has_org_permission(v_cert.organization_id, 'credential.issue') then
    raise exception 'permission denied: issuing requires credential.issue' using errcode = '42501';
  end if;
  select * into v_m from public.organization_memberships
   where id = p_membership_id and organization_id = v_cert.organization_id;
  if v_m.id is null or v_m.status <> 'active' then
    raise exception 'membership is not active in this organization' using errcode = '23514';
  end if;
  v_id := app.issue_credential_internal(
    p_certificate_id, p_membership_id, null, null, null,
    coalesce(p_recipient_name, ''));
  if v_id is null then
    raise exception 'an active credential already exists for this member' using errcode = '23505';
  end if;
  return v_id;
end;
$$;

create or replace function public.revoke_credential(
  p_credential_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row record;
begin
  if p_reason is null or char_length(trim(p_reason)) < 5 then
    raise exception 'a revocation reason is required' using errcode = '22000';
  end if;
  select * into v_row from public.issued_credentials where id = p_credential_id for update;
  if v_row.id is null then
    raise exception 'credential not found' using errcode = 'P0002';
  end if;
  if not app.has_org_permission(v_row.organization_id, 'credential.revoke') then
    raise exception 'permission denied: revoking requires credential.revoke' using errcode = '42501';
  end if;
  if v_row.status = 'revoked' then
    return; -- idempotent
  end if;
  update public.issued_credentials
     set status = 'revoked', revoked_at = now(), revoked_by = (select auth.uid()),
         revocation_reason = trim(p_reason)
   where id = p_credential_id;

  perform app.emit_event(
    v_row.organization_id, 'credential.certificate.revoked', 'issued_credential', p_credential_id,
    jsonb_build_object('certificate_id', v_row.certificate_id),
    jsonb_build_object('reason', trim(p_reason)),
    'credential-revoked:' || p_credential_id::text
  );
end;
$$;

-- Public verification: privacy-safe fields only; lazy expiration; callable
-- anonymously by design (documented exception — the verification page).
create or replace function public.verify_credential(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_row record;
  v_status text;
begin
  if p_code is null or p_code !~ '^NVK-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$' then
    return null;
  end if;
  select ic.*, o.name as organization_name,
         coalesce(b.display_name, o.name) as organization_display
    into v_row
    from public.issued_credentials ic
    join public.organizations o on o.id = ic.organization_id
    left join public.organization_branding b on b.organization_id = ic.organization_id
   where ic.verification_code = p_code;
  if v_row.id is null then
    return null;
  end if;
  v_status := case
    when v_row.status = 'revoked' then 'revoked'
    when v_row.expires_at is not null and v_row.expires_at <= now() then 'expired'
    else 'active'
  end;
  return jsonb_build_object(
    'title', v_row.title,
    'organization', v_row.organization_display,
    'recipient', v_row.recipient_name,
    'issuedAt', v_row.issued_at,
    'expiresAt', v_row.expires_at,
    'status', v_status,
    'verificationCode', v_row.verification_code
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Completion gate: a lesson with a required completing assessment can no
-- longer be self-completed; the assessment outcome is the only path.
-- (Additive Phase 1D gate inside the 1C learner progress RPC.)
-- ---------------------------------------------------------------------------
create or replace function app.lesson_requires_assessment_pass(
  p_enrollment_id uuid,
  p_lesson_id uuid
)
returns text -- null = no gate; otherwise the blocking assessment title
language sql
stable
security definer
set search_path = ''
as $$
  select a.title
    from public.assessment_assignments asg
    join public.assessments a on a.id = asg.assessment_id
   where asg.lesson_id = p_lesson_id
     and asg.status = 'active'
     and asg.required
     and asg.completion_effect = 'complete_lesson'
     and not exists (
       select 1 from public.assessment_attempts at
        where at.assignment_id = asg.id
          and at.enrollment_id = p_enrollment_id
          and at.status = 'passed'
     )
   limit 1;
$$;
revoke all on function app.lesson_requires_assessment_pass(uuid, uuid) from public, anon, authenticated;

-- Redefine record_lesson_progress with the Phase 1D assessment gate:
-- a lesson carrying a required, completion-effecting assessment can only
-- complete through a passed attempt (body carried from 20260728204351).
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
  v_gate text;
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

  -- Phase 1D gate: required completing assessments own lesson completion
  if p_action = 'complete' then
    v_gate := app.lesson_requires_assessment_pass(p_enrollment_id, p_lesson_id);
    if v_gate is not null then
      raise exception 'this lesson requires passing its assessment: %', v_gate
        using errcode = '23514';
    end if;
  end if;

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

-- Redefine evaluate_course_completion to also issue completion credentials
-- (body carried from 20260728203330 with the issuance hooks added).
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
    perform app.issue_credentials_for_completion(
      p_enrollment_id, p_course_id, v_course_progress.course_version_id, false);
  else
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
    perform app.issue_credentials_for_completion(
      p_enrollment_id, p_course_id, v_course_progress.course_version_id, v_all_courses_done);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Execution grants (each function authorizes internally)
-- ---------------------------------------------------------------------------
revoke all on function public.publish_assessment(uuid) from public, anon;
revoke all on function public.assign_assessment(uuid, uuid, boolean, text) from public, anon;
revoke all on function public.set_assessment_assignment_status(uuid, text) from public, anon;
revoke all on function public.start_assessment_attempt(uuid, uuid) from public, anon;
revoke all on function public.get_assessment_attempt_payload(uuid) from public, anon;
revoke all on function public.save_assessment_response(uuid, uuid, jsonb) from public, anon;
revoke all on function public.submit_assessment_attempt(uuid) from public, anon;
revoke all on function public.claim_assessment_review(uuid) from public, anon;
revoke all on function public.complete_assessment_review(uuid, jsonb, jsonb, text) from public, anon;
revoke all on function public.issue_credential(uuid, uuid, text) from public, anon;
revoke all on function public.revoke_credential(uuid, text) from public, anon;
grant execute on function public.publish_assessment(uuid) to authenticated;
grant execute on function public.assign_assessment(uuid, uuid, boolean, text) to authenticated;
grant execute on function public.set_assessment_assignment_status(uuid, text) to authenticated;
grant execute on function public.start_assessment_attempt(uuid, uuid) to authenticated;
grant execute on function public.get_assessment_attempt_payload(uuid) to authenticated;
grant execute on function public.save_assessment_response(uuid, uuid, jsonb) to authenticated;
grant execute on function public.submit_assessment_attempt(uuid) to authenticated;
grant execute on function public.claim_assessment_review(uuid) to authenticated;
grant execute on function public.complete_assessment_review(uuid, jsonb, jsonb, text) to authenticated;
grant execute on function public.issue_credential(uuid, uuid, text) to authenticated;
grant execute on function public.revoke_credential(uuid, text) to authenticated;
-- Public verification is intentionally anonymous (documented):
revoke all on function public.verify_credential(text) from public;
grant execute on function public.verify_credential(text) to anon, authenticated;
