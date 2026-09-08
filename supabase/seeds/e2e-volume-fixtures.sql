-- =============================================================================
-- E2E VOLUME FIXTURES — the deliberate version of what test residue used to
-- provide by accident.
--
-- Two happy-path specs require real volume in the alpha tenant:
--   · "a multi-page collection actually pages" needs > DEFAULT_PAGE_SIZE (25)
--     courses so the /admin/courses pager exists and page 2 differs;
--   · "the Academy does not slow down with more enrollments" needs
--     alpha.learner holding > 20 enrollments (the query-per-row regression
--     only shows at volume).
-- Their comments always claimed "this tenant is seeded with far more courses
-- than one page holds" — until 2026-09-07 that volume was actually leaked
-- test artifacts, and purging the leak broke both specs. This seed makes the
-- claim true: 30 distinctly-named published courses and 25 enrollments,
-- deterministic ids, honest content.
--
-- Idempotent: no-op when e2e-vol-01 already exists. Single session required
-- (pg_temp function).
-- =============================================================================

create function pg_temp.vol_uid(p_key text) returns uuid
language sql immutable as $f$
  select encode(
    set_byte(
      set_byte(
        substring(extensions.digest('novakore:e2e-volume:v1:' || p_key, 'sha1') from 1 for 16),
        6, (get_byte(substring(extensions.digest('novakore:e2e-volume:v1:' || p_key, 'sha1') from 1 for 16), 6) & 15) | 80),
      8, (get_byte(substring(extensions.digest('novakore:e2e-volume:v1:' || p_key, 'sha1') from 1 for 16), 8) & 63) | 128),
    'hex')::uuid
$f$;

do $$
declare
  v_org uuid;
  v_learner_membership uuid;
  v_author uuid := '00000000-0000-4000-8000-000000000015';   -- alpha.author
  v_publisher uuid := '00000000-0000-4000-8000-000000000014'; -- alpha.reviewer
  i int;
  nn text;
  c_id uuid; m_id uuid; l_id uuid; lv_id uuid; cv_id uuid;
begin
  select id into v_org from public.organizations where slug = 'alpha-learning';
  if v_org is null then
    raise notice 'alpha-learning absent; skipping e2e volume fixtures';
    return;
  end if;
  if exists (select 1 from public.courses where organization_id = v_org and slug = 'e2e-vol-01') then
    raise notice 'e2e volume fixtures already present; skipping';
    return;
  end if;
  select m.id into v_learner_membership
  from public.organization_memberships m
  join auth.users u on u.id = m.user_id
  where m.organization_id = v_org
    and u.email = 'alpha.learner@novakore.test'
    and m.status = 'active';
  if v_learner_membership is null then
    raise notice 'alpha.learner membership absent; skipping e2e volume fixtures';
    return;
  end if;

  for i in 1..30 loop
    nn := lpad(i::text, 2, '0');
    c_id  := pg_temp.vol_uid('course:' || nn);
    m_id  := pg_temp.vol_uid('module:' || nn);
    l_id  := pg_temp.vol_uid('lesson:' || nn);
    lv_id := pg_temp.vol_uid('lesson-version:' || nn);
    cv_id := pg_temp.vol_uid('course-version:' || nn);

    insert into public.courses (id, organization_id, slug, title, summary, status, created_by)
    values (c_id, v_org, 'e2e-vol-' || nn, 'Catalog volume fixture ' || nn,
            'Deliberate pagination/volume fixture for the E2E suite (seeds/e2e-volume-fixtures.sql).',
            'published', v_author);

    insert into public.modules (id, organization_id, course_id, title, position)
    values (m_id, v_org, c_id, 'Module', 'a0');

    insert into public.lessons (id, organization_id, course_id, module_id, title, position, status)
    values (l_id, v_org, c_id, m_id, 'Overview', 'a0', 'published');

    insert into public.lesson_versions (id, organization_id, lesson_id, course_id, version_number, title, blocks, published_by)
    values (lv_id, v_org, l_id, c_id, 1, 'Overview',
            jsonb_build_array(jsonb_build_object(
              'id', pg_temp.vol_uid('block:' || nn)::text,
              'type', 'rich_text',
              'position', 'a0',
              'schemaVersion', 1,
              'data', jsonb_build_object('text', 'Volume fixture lesson ' || nn || '.')
            )),
            v_publisher);

    insert into public.course_versions (id, organization_id, course_id, version_number, title, structure, completion_rule, published_by)
    values (cv_id, v_org, c_id, 1, 'Catalog volume fixture ' || nn,
            jsonb_build_object(
              'schemaVersion', 1,
              'modules', jsonb_build_array(jsonb_build_object(
                'moduleId', m_id::text,
                'title', 'Module',
                'position', 'a0',
                'lessons', jsonb_build_array(jsonb_build_object(
                  'lessonId', l_id::text,
                  'lessonVersionId', lv_id::text,
                  'title', 'Overview',
                  'position', 'a0',
                  'required', true,
                  'versionNumber', 1
                ))
              ))
            ),
            jsonb_build_object('type', 'all_required_lessons', 'schemaVersion', 1),
            v_publisher);

    update public.lessons set current_published_version_id = lv_id where id = l_id;
    update public.courses set current_published_version_id = cv_id where id = c_id;

    -- 25 active enrollments make alpha.learner the documented heavy fixture.
    if i <= 25 then
      insert into public.enrollments (id, organization_id, membership_id, target_type, course_id,
                                      pinned_course_version_id, status, source, started_at)
      values (pg_temp.vol_uid('enrollment:' || nn), v_org, v_learner_membership, 'course', c_id,
              cv_id, 'active', 'assigned', now());
    end if;
  end loop;
end $$;

drop function pg_temp.vol_uid(text);
