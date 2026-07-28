-- Fix from Phase 1D browser QA: inside the assessments_select_assigned
-- policy's EXISTS subquery, the unqualified `id` resolved to
-- assessment_assignments.id (the innermost scope), not assessments.id, so
-- the predicate compared an assignment to itself and learners could never
-- read the metadata row of an assigned published assessment. Qualify the
-- outer column explicitly.
drop policy assessments_select_assigned on public.assessments;
create policy assessments_select_assigned on public.assessments
  for select to authenticated
  using (
    status = 'published'
    and exists (
      select 1 from public.assessment_assignments asg
      where asg.assessment_id = assessments.id
        and asg.status = 'active'
        and app.can_access_course(asg.organization_id, asg.course_id)
    )
  );
