-- Fix from the Phase 1D isolation suite: plpgsql `record` variables cannot
-- be cast to a composite parameter type, so start_assessment_attempt failed
-- at the enrollment-coverage check ("cannot cast type record to
-- public.enrollments"). Declare the variable with the composite type.
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
  v_e public.enrollments;
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
