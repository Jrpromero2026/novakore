-- =============================================================================
-- PRACTICAL EVALUATION FOUNDATION
-- Observed practical sign-offs and terminal (oral/live) defenses as first-class
-- platform primitives. A lesson can carry a practical requirement: a human
-- evaluator must record an observed evaluation before that lesson can complete.
-- Evaluations are append-only, immutable, audited records with a three-state
-- result (passed / remediation_required / failed) so an open remediation
-- mechanically withholds lesson, course, path, and credential completion.
--
-- Also adds opt-in hard sequential gating inside a course
-- (courses.enforce_sequence): the in-course sequence that computeLessonAccess
-- already renders becomes SQL-enforced for courses that request it, exactly at
-- the hook documented in docs/architecture/prerequisites-and-unlocks.md §4.
-- Existing courses keep today's behavior (default false).
--
-- No automated interpretation is introduced anywhere: every evaluation row
-- carries a human evaluator identity, and results are recorded, never derived.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Opt-in hard sequence gate flag
-- ---------------------------------------------------------------------------
alter table public.courses
  add column enforce_sequence boolean not null default false;

comment on column public.courses.enforce_sequence is
  'When true, record_lesson_progress refuses to complete a lesson while an '
  'earlier required lesson (pinned-structure order) is incomplete. Opt-in; '
  'the UI sequence gate is unchanged for courses that leave this false.';

-- ---------------------------------------------------------------------------
-- practical_requirements — the definition side (what must be observed, where)
-- ---------------------------------------------------------------------------
create table public.practical_requirements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  course_id uuid not null,
  lesson_id uuid not null unique references public.lessons (id) on delete cascade,
  kind text not null check (kind in ('practical_sign_off', 'terminal_defense')),
  code text not null check (code ~ '^[A-Z0-9][A-Z0-9-]{1,19}$'),
  title text not null check (char_length(title) between 2 and 200),
  competency_codes text[] not null default '{}'
    check (coalesce(array_length(competency_codes, 1), 0) <= 40),
  -- Structured rubric definition (dimensions / scale / pass rule), recorded
  -- verbatim from the governing curriculum. Applied by a human, never by SQL.
  rubric jsonb not null default '{}' check (jsonb_typeof(rubric) = 'object'),
  guidance text check (char_length(guidance) <= 10000),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (course_id, code),
  unique (id, organization_id),
  foreign key (course_id, organization_id)
    references public.courses (id, organization_id) on delete cascade
);

create index practical_requirements_course_idx
  on public.practical_requirements (course_id);

create trigger set_updated_at
  before update on public.practical_requirements
  for each row execute function app.set_updated_at();

create trigger audit_change
  after insert or update or delete on public.practical_requirements
  for each row execute function app.audit_change('practical_requirement');

alter table public.practical_requirements enable row level security;

-- Learners must see the requirement attached to their gate lesson; staff see
-- them through the same course-access rule used for course/version reads.
create policy practical_requirements_select on public.practical_requirements
  for select to authenticated
  using (app.can_access_course(organization_id, course_id));

revoke insert, update, delete on public.practical_requirements from authenticated;
revoke all on public.practical_requirements from anon;

-- ---------------------------------------------------------------------------
-- practical_evaluations — the record side (append-only, immutable, audited)
-- ---------------------------------------------------------------------------
create table public.practical_evaluations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  requirement_id uuid not null references public.practical_requirements (id) on delete cascade,
  enrollment_id uuid not null references public.enrollments (id) on delete cascade,
  membership_id uuid not null,
  course_id uuid not null,
  lesson_id uuid not null,
  -- Denormalized from the requirement at record time so the record keeps its
  -- meaning even if the requirement definition is later revised.
  kind text not null check (kind in ('practical_sign_off', 'terminal_defense')),
  code text not null,
  result text not null check (result in ('passed', 'remediation_required', 'failed')),
  -- Human-recorded structured rubric scores / notes (shape governed in the
  -- domain package; SQL requires only a JSON object).
  rubric jsonb not null default '{}' check (jsonb_typeof(rubric) = 'object'),
  evidence text check (char_length(evidence) <= 10000),
  comments text check (char_length(comments) <= 10000),
  competency_codes text[] not null default '{}',
  evaluator_id uuid not null,
  evaluated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (membership_id, organization_id)
    references public.organization_memberships (id, organization_id)
);

-- Exactly-once pass per learner per requirement; failed / remediation rows may
-- accumulate (they are the auditable history of the practical process).
create unique index practical_evaluations_one_passed
  on public.practical_evaluations (enrollment_id, requirement_id)
  where result = 'passed';

create index practical_evaluations_enrollment_idx
  on public.practical_evaluations (enrollment_id, requirement_id, evaluated_at desc);
create index practical_evaluations_org_course_idx
  on public.practical_evaluations (organization_id, course_id);

-- Recorded evaluations are immutable. Corrections are new superseding rows.
create trigger protect_practical_evaluations
  before update or delete on public.practical_evaluations
  for each row execute function app.protect_immutable();

create trigger audit_change
  after insert on public.practical_evaluations
  for each row execute function app.audit_change('practical_evaluation');

alter table public.practical_evaluations enable row level security;

create policy practical_evaluations_select on public.practical_evaluations
  for select to authenticated
  using (
    app.has_org_permission(organization_id, 'assessment.grade')
    or app.has_org_permission(organization_id, 'progress.view.others')
    or exists (
      select 1 from public.organization_memberships m
       where m.id = membership_id
         and m.user_id = (select auth.uid())
    )
  );

revoke insert, update, delete on public.practical_evaluations from authenticated;
revoke all on public.practical_evaluations from anon;

-- ---------------------------------------------------------------------------
-- Gate helper: does this lesson still owe a passed practical evaluation?
-- ---------------------------------------------------------------------------
create or replace function app.lesson_requires_practical_pass(
  p_enrollment_id uuid,
  p_lesson_id uuid
)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select pr.title
    from public.practical_requirements pr
   where pr.lesson_id = p_lesson_id
     and not exists (
       select 1 from public.practical_evaluations pe
        where pe.enrollment_id = p_enrollment_id
          and pe.requirement_id = pr.id
          and pe.result = 'passed'
     )
   limit 1;
$$;
revoke all on function app.lesson_requires_practical_pass(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- record_lesson_progress — body carried from 20260728225909 with two additions:
--   1. the practical gate (beside the Phase 1D assessment gate);
--   2. the opt-in hard sequence gate (courses.enforce_sequence).
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
  v_gate text;
  v_enforce_sequence boolean;
  v_blocking text;
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
    -- Practical gate: an observed evaluation owns this lesson's completion.
    v_gate := app.lesson_requires_practical_pass(p_enrollment_id, p_lesson_id);
    if v_gate is not null then
      raise exception 'this lesson is completed by an evaluator recording: %', v_gate
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

  -- Opt-in hard sequence gate: pinned-structure order, required lessons only.
  if p_action = 'complete' then
    select enforce_sequence into v_enforce_sequence
      from public.courses where id = v_course_id;
    if v_enforce_sequence then
      with ordered as (
        select entry.value as lesson, entry.ord
          from jsonb_path_query(
                 (select structure from public.course_versions
                   where id = v_course_progress.course_version_id),
                 '$.modules[*].lessons[*]'
               ) with ordinality as entry(value, ord)
      )
      select o.lesson ->> 'title' into v_blocking
        from ordered o
       where o.ord < (select t.ord from ordered t
                       where t.lesson ->> 'lessonId' = p_lesson_id::text)
         and (o.lesson ->> 'required')::boolean
         and not exists (
           select 1 from public.progress_records pr
            where pr.enrollment_id = p_enrollment_id
              and pr.lesson_id = ((o.lesson ->> 'lessonId'))::uuid
              and pr.status in ('completed', 'exempted')
         )
       order by o.ord
       limit 1;
      if v_blocking is not null then
        raise exception 'locked by sequence: complete "%" first', v_blocking
          using errcode = '42501';
      end if;
    end if;
  end if;

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

-- ---------------------------------------------------------------------------
-- record_practical_evaluation — the single write path for evaluations.
-- Requires assessment.grade; blocks self-evaluation; requires the learner to
-- have reached the gate (all earlier required lessons complete) so recorded
-- states can never contradict the sequence; on 'passed', completes the gate
-- lesson exactly the way apply_assessment_outcome does.
-- ---------------------------------------------------------------------------
create or replace function public.record_practical_evaluation(
  p_enrollment_id uuid,
  p_requirement_id uuid,
  p_result text,
  p_rubric jsonb default '{}'::jsonb,
  p_evidence text default null,
  p_comments text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req record;
  v_e record;
  v_membership record;
  v_course_progress record;
  v_entry jsonb;
  v_lesson_version_id uuid;
  v_existing record;
  v_blocking text;
  v_eval_id uuid;
begin
  if p_result not in ('passed', 'remediation_required', 'failed') then
    raise exception 'invalid result' using errcode = '22000';
  end if;
  if p_rubric is null or jsonb_typeof(p_rubric) <> 'object' then
    raise exception 'rubric must be a JSON object' using errcode = '22000';
  end if;

  select * into v_req from public.practical_requirements where id = p_requirement_id;
  if v_req.id is null then
    raise exception 'practical requirement not found' using errcode = 'P0002';
  end if;

  if not app.has_org_permission(v_req.organization_id, 'assessment.grade') then
    raise exception 'assessment.grade is required to record a practical evaluation'
      using errcode = '42501';
  end if;

  select * into v_e from public.enrollments where id = p_enrollment_id for update;
  if v_e.id is null or v_e.organization_id <> v_req.organization_id then
    raise exception 'enrollment not found' using errcode = 'P0002';
  end if;
  if v_e.status not in ('active', 'completed') then
    raise exception 'enrollment is not active' using errcode = '23514';
  end if;
  if v_e.target_type = 'course' then
    if v_e.course_id <> v_req.course_id then
      raise exception 'enrollment does not cover this course' using errcode = '42501';
    end if;
  elsif not exists (
    select 1 from public.path_nodes pn
     where pn.path_id = v_e.learning_path_id and pn.course_id = v_req.course_id
  ) then
    raise exception 'enrollment does not cover this course' using errcode = '42501';
  end if;

  select * into v_membership from public.organization_memberships where id = v_e.membership_id;
  if v_membership.user_id = (select auth.uid()) then
    raise exception 'you cannot record your own practical evaluation' using errcode = '42501';
  end if;

  -- The learner must have reached the gate under their pinned version.
  select * into v_course_progress
    from public.progress_records
   where enrollment_id = p_enrollment_id and course_id = v_req.course_id
     and subject_type = 'course'
   for update;
  if v_course_progress.id is null then
    raise exception 'the learner has not started this course' using errcode = '23514';
  end if;

  select entry.value into v_entry
    from jsonb_path_query(
           (select structure from public.course_versions
             where id = v_course_progress.course_version_id),
           '$.modules[*].lessons[*]'
         ) as entry(value)
   where entry.value ->> 'lessonId' = v_req.lesson_id::text
   limit 1;
  if v_entry is null then
    raise exception 'the gate lesson is not part of the learner''s assigned version'
      using errcode = '23514';
  end if;
  v_lesson_version_id := (v_entry ->> 'lessonVersionId')::uuid;

  with ordered as (
    select entry.value as lesson, entry.ord
      from jsonb_path_query(
             (select structure from public.course_versions
               where id = v_course_progress.course_version_id),
             '$.modules[*].lessons[*]'
           ) with ordinality as entry(value, ord)
  )
  select o.lesson ->> 'title' into v_blocking
    from ordered o
   where o.ord < (select t.ord from ordered t
                   where t.lesson ->> 'lessonId' = v_req.lesson_id::text)
     and (o.lesson ->> 'required')::boolean
     and not exists (
       select 1 from public.progress_records pr
        where pr.enrollment_id = p_enrollment_id
          and pr.lesson_id = ((o.lesson ->> 'lessonId'))::uuid
          and pr.status in ('completed', 'exempted')
     )
   order by o.ord
   limit 1;
  if v_blocking is not null then
    raise exception 'the learner has not reached this gate: "%" is incomplete', v_blocking
      using errcode = '23514';
  end if;

  insert into public.practical_evaluations
    (organization_id, requirement_id, enrollment_id, membership_id, course_id,
     lesson_id, kind, code, result, rubric, evidence, comments,
     competency_codes, evaluator_id)
  values
    (v_req.organization_id, v_req.id, p_enrollment_id, v_e.membership_id,
     v_req.course_id, v_req.lesson_id, v_req.kind, v_req.code, p_result,
     p_rubric, nullif(trim(p_evidence), ''), nullif(trim(p_comments), ''),
     v_req.competency_codes, (select auth.uid()))
  returning id into v_eval_id;

  perform app.emit_event(
    v_req.organization_id, 'assessment.practical.recorded', 'lesson', v_req.lesson_id,
    jsonb_build_object('enrollment_id', p_enrollment_id,
                       'requirement_id', v_req.id,
                       'kind', v_req.kind, 'code', v_req.code),
    jsonb_build_object('result', p_result),
    'practical-recorded:' || v_eval_id::text
  );

  if p_result = 'passed' then
    select * into v_existing
      from public.progress_records
     where enrollment_id = p_enrollment_id and lesson_id = v_req.lesson_id
     for update;
    if v_existing.id is null then
      insert into public.progress_records
        (organization_id, enrollment_id, subject_type, course_id, lesson_id,
         lesson_version_id, course_version_id, status, completed_at)
      values
        (v_req.organization_id, p_enrollment_id, 'lesson', v_req.course_id,
         v_req.lesson_id, v_lesson_version_id, v_course_progress.course_version_id,
         'completed', now());
    elsif v_existing.status not in ('completed', 'exempted') then
      update public.progress_records
         set status = 'completed', completed_at = now()
       where id = v_existing.id;
    end if;

    -- same idempotency key as the learner path: exactly-once lesson completion
    perform app.emit_event(
      v_req.organization_id, 'learning.lesson.completed', 'lesson', v_req.lesson_id,
      jsonb_build_object('enrollment_id', p_enrollment_id,
                         'lesson_version_id', v_lesson_version_id,
                         'course_version_id', v_course_progress.course_version_id),
      '{}'::jsonb,
      'lesson-completed:' || p_enrollment_id::text || ':' || v_req.lesson_id::text
    );
    perform app.evaluate_course_completion(p_enrollment_id, v_req.course_id);
  end if;

  return v_eval_id;
end;
$$;

revoke all on function public.record_practical_evaluation(uuid, uuid, text, jsonb, text, text)
  from public, anon;
grant execute on function public.record_practical_evaluation(uuid, uuid, text, jsonb, text, text)
  to authenticated;
