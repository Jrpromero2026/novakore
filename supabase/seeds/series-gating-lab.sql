-- =============================================================================
-- SERIES GATING LAB — dedicated fixtures tenant for the series-gating suite
-- (packages/database/src/__tests__/g3-foundations.test.ts).
--
-- WHY THIS EXISTS: the suite originally ran against the real G3 Performance
-- tenant. On 2026-08-28 G3 staff (performance@gthreesports.com) removed the
-- eight @novakore.test fixture accounts from their member roster — a
-- reasonable admin action that broke 11 tests, because removed memberships
-- are immutable history and RLS then hides everything from those accounts.
-- Test fixtures must never live in a staff-managed tenant; this seed gives
-- them their own.
--
-- WHAT IT DOES: clones the structural graph of the G3 Foundations seed
-- (courses, modules, lessons, published versions, paths, practical
-- requirements, curriculum records, certificates, and the fixture
-- memberships/enrollments/progress/evaluations/credentials) into an isolated
-- "series-gating-lab" org. Ids are remapped deterministically (v5-style over
-- the lab namespace), including ids embedded inside course_version structure
-- JSON, so the clone is reproducible from the same source seed. Auth users
-- are shared with the G3 seed (same fixture accounts, new memberships).
--
-- ORDERING: requires seeds/g3-performance-foundations.sql first (see the
-- \ir order in seed.sql). Idempotent: no-op when the lab org already exists.
-- MUST run in a single session (pg_temp objects).
-- =============================================================================

create function pg_temp.lab_uid(p_key text) returns uuid
language sql immutable as $f$
  select encode(
    set_byte(
      set_byte(
        substring(extensions.digest('novakore:series-gating-lab:v1.0:' || p_key, 'sha1') from 1 for 16),
        6, (get_byte(substring(extensions.digest('novakore:series-gating-lab:v1.0:' || p_key, 'sha1') from 1 for 16), 6) & 15) | 80),
      8, (get_byte(substring(extensions.digest('novakore:series-gating-lab:v1.0:' || p_key, 'sha1') from 1 for 16), 8) & 63) | 128),
    'hex')::uuid
$f$;

create table pg_temp.idmap (old uuid primary key, new uuid not null);

create function pg_temp.remap(v jsonb) returns jsonb
language sql stable as $f$
  select case jsonb_typeof(v)
    when 'object' then coalesce(
      (select jsonb_object_agg(e.key, pg_temp.remap(e.value)) from jsonb_each(v) e),
      '{}'::jsonb)
    when 'array' then coalesce(
      (select jsonb_agg(pg_temp.remap(e.value) order by e.i) from jsonb_array_elements(v) with ordinality e(value, i)),
      '[]'::jsonb)
    when 'string' then coalesce(
      (select to_jsonb(m.new::text) from pg_temp.idmap m
       where v #>> '{}' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         and m.old = (v #>> '{}')::uuid),
      v)
    else v
  end
$f$;

do $$
declare
  v_src uuid := '26f6aa4a-4ade-4bb0-842f-12ca2e5bc115'; -- G3 Performance
  v_lab uuid := pg_temp.lab_uid('org');
  -- the eight fixture accounts plus the repo owner login, nothing else
  v_users uuid[] := array[
    '90a22b77-2869-5dc4-bace-3d4799a742d5', -- g3.learner.new
    '37c67922-8060-56f0-8aa4-ddf766197e7e', -- g3.learner.101
    'ba553a9a-9e5e-561d-8e90-8339123dbdea', -- g3.learner.102
    'b551a703-760a-5498-9e98-a92f360dff0f', -- g3.learner.modules
    'e6227aef-337f-51ae-bb5b-df3e44cf8136', -- g3.learner.practicals
    '302c5342-1f98-5f31-9fd2-ba107c7689d9', -- g3.learner.remediation
    '4e926688-1c46-58fa-a0e1-473b5c84bfbb', -- g3.learner.complete
    'ba56ca5e-9ae4-50f1-85f6-7f1283b64f2c', -- g3.assessor
    '00000000-0000-4000-8000-000000000031'  -- repo owner (inspection access)
  ]::uuid[];
  v_tables text[] := array[
    'academies', 'learning_systems', 'learning_paths',
    'courses', 'modules', 'lessons', 'lesson_versions', 'course_versions',
    'path_nodes', 'prerequisites', 'practical_requirements',
    'curriculum_records', 'certificate_templates', 'certificates',
    'enrollments', 'progress_records', 'practical_evaluations',
    'issued_credentials'
  ];
  t text;
  n bigint;
  src_n bigint;
begin
  if exists (select 1 from public.organizations where id = v_lab or slug = 'series-gating-lab') then
    raise notice 'series-gating-lab already present; skipping';
    return;
  end if;
  if not exists (select 1 from public.organizations where id = v_src) then
    raise notice 'G3 Foundations source org absent; skipping lab clone';
    return;
  end if;

  -- 1. the lab organization, standard shape
  insert into public.organizations (id, name, slug, status, use_case, use_case_detail)
  values (v_lab, 'Series Gating Lab', 'series-gating-lab', 'active', 'qualification',
          'Isolated fixtures tenant for the series-gating real-DB suite. Not a customer.');
  insert into public.organization_settings (organization_id) values (v_lab);
  insert into public.organization_branding (organization_id, display_name) values (v_lab, 'Series Gating Lab');
  perform app.create_system_roles(v_lab);

  -- 2. the id map: org, roles (by key), memberships (fixture users only),
  --    and every row of every cloned table
  insert into pg_temp.idmap values (v_src, v_lab);
  insert into pg_temp.idmap
  select src.id, lab.id
  from public.organization_roles src
  join public.organization_roles lab
    on lab.organization_id = v_lab and lab.key = src.key and lab.is_system
  where src.organization_id = v_src and src.is_system;
  insert into pg_temp.idmap
  select m.id, pg_temp.lab_uid(m.id::text)
  from public.organization_memberships m
  where m.organization_id = v_src and m.user_id = any (v_users);
  for t in select unnest(v_tables) loop
    if t = 'enrollments' then
      -- only fixture-owned enrollments: real staff memberships stay behind
      execute
        'insert into pg_temp.idmap select id, pg_temp.lab_uid(id::text) from public.enrollments where organization_id = $1 and membership_id in (select old from pg_temp.idmap) on conflict (old) do nothing'
      using v_src;
    elsif t in ('progress_records', 'practical_evaluations', 'issued_credentials') then
      execute format(
        'insert into pg_temp.idmap select id, pg_temp.lab_uid(id::text) from public.%I where organization_id = $1 and enrollment_id in (select old from pg_temp.idmap) on conflict (old) do nothing',
        t) using v_src;
    else
      execute format(
        'insert into pg_temp.idmap select id, pg_temp.lab_uid(id::text) from public.%I where organization_id = $1 on conflict (old) do nothing',
        t) using v_src;
    end if;
  end loop;

  -- 3. memberships: cloned ACTIVE regardless of source status (staff removed
  --    the originals from their tenant; here they are first-class fixtures)
  insert into public.organization_memberships (id, organization_id, user_id, status, invited_at, accepted_at, created_at, updated_at)
  select (select new from pg_temp.idmap where old = m.id), v_lab, m.user_id, 'active', m.invited_at, coalesce(m.accepted_at, now()), now(), now()
  from public.organization_memberships m
  where m.organization_id = v_src and m.user_id = any (v_users);

  -- 4. the structural graph, generically remapped. Published-version pointers
  --    on courses/lessons are stripped pre-insert (their targets come later)
  --    and restored afterwards. Every uuid anywhere in a row — including ids
  --    embedded in course_version structure JSON — is remapped through idmap.
  for t in select unnest(v_tables) loop
    if t in ('courses', 'lessons') then
      execute format(
        'insert into public.%I select (jsonb_populate_record(null::public.%I, pg_temp.remap(to_jsonb(s)) || jsonb_build_object(''current_published_version_id'', null))).* from public.%I s where s.organization_id = $1 and s.id in (select old from pg_temp.idmap)',
        t, t, t) using v_src;
    elsif t = 'issued_credentials' then
      execute
        'insert into public.issued_credentials select (jsonb_populate_record(null::public.issued_credentials, pg_temp.remap(to_jsonb(s)) || jsonb_build_object(''verification_code'', ' ||
        '''NVK-'' || upper(substr(encode(extensions.digest(s.verification_code || ''series-gating-lab'', ''sha1''), ''hex''), 1, 4)) || ''-'' || ' ||
        'upper(substr(encode(extensions.digest(s.verification_code || ''series-gating-lab'', ''sha1''), ''hex''), 5, 4)) || ''-'' || ' ||
        'upper(substr(encode(extensions.digest(s.verification_code || ''series-gating-lab'', ''sha1''), ''hex''), 9, 4)) || ''-'' || ' ||
        'upper(substr(encode(extensions.digest(s.verification_code || ''series-gating-lab'', ''sha1''), ''hex''), 13, 4))))).* ' ||
        'from public.issued_credentials s where s.organization_id = $1 and s.id in (select old from pg_temp.idmap)'
      using v_src;
    else
      execute format(
        'insert into public.%I select (jsonb_populate_record(null::public.%I, pg_temp.remap(to_jsonb(s)))).* from public.%I s where s.organization_id = $1 and s.id in (select old from pg_temp.idmap)',
        t, t, t) using v_src;
    end if;
  end loop;

  update public.courses c
     set current_published_version_id = (select new from pg_temp.idmap where old = s.current_published_version_id)
  from public.courses s
  where c.organization_id = v_lab and s.organization_id = v_src
    and c.id = (select new from pg_temp.idmap where old = s.id)
    and s.current_published_version_id is not null;

  update public.lessons l
     set current_published_version_id = (select new from pg_temp.idmap where old = s.current_published_version_id)
  from public.lessons s
  where l.organization_id = v_lab and s.organization_id = v_src
    and l.id = (select new from pg_temp.idmap where old = s.id)
    and s.current_published_version_id is not null;

  -- path canvas layouts: keyed by path_id (no id column, so outside the
  -- generic loop); layout JSON keys are node ids and remap through the map
  insert into public.path_layouts (path_id, organization_id, layout, updated_by, updated_at)
  select (select new from pg_temp.idmap where old = s.path_id), v_lab,
         (select coalesce(jsonb_object_agg(
            coalesce((select m.new::text from pg_temp.idmap m
                      where e.key ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                        and m.old = e.key::uuid), e.key),
            e.value), '{}'::jsonb)
          from jsonb_each(s.layout) e),
         s.updated_by, s.updated_at
  from public.path_layouts s
  where s.organization_id = v_src;

  -- role assignments last: academy-scoped assignments reference cloned academies
  insert into public.organization_member_roles (id, organization_id, membership_id, role_id, academy_id, created_at)
  select pg_temp.lab_uid(mr.id::text), v_lab,
         (select new from pg_temp.idmap where old = mr.membership_id),
         (select new from pg_temp.idmap where old = mr.role_id),
         (select new from pg_temp.idmap where old = mr.academy_id),
         now()
  from public.organization_member_roles mr
  join public.organization_memberships m on m.id = mr.membership_id
  where mr.organization_id = v_src and m.user_id = any (v_users)
    and exists (select 1 from pg_temp.idmap where old = mr.role_id);

  -- 5. verified, not assumed: everything the map selected must have arrived
  for t in select unnest(v_tables) loop
    execute format('select count(*) from public.%I where organization_id = $1 and id in (select old from pg_temp.idmap)', t) into src_n using v_src;
    execute format('select count(*) from public.%I where organization_id = $1', t) into n using v_lab;
    if n <> src_n then
      raise exception 'series-gating-lab clone incomplete: % has % of % rows', t, n, src_n;
    end if;
  end loop;
end $$;

drop function pg_temp.remap(jsonb);
drop function pg_temp.lab_uid(text);
drop table pg_temp.idmap;
