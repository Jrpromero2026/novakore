-- NovaKore Phase 2 — Studio storage: lesson media, source documents, and
-- assessment submissions. Three DISTINCT private buckets (owner decision 7:
-- learner submissions never share lesson-media storage), path-scoped
-- policies, signed URLs only, no SVG anywhere outside the branding gate.

-- ---------------------------------------------------------------------------
-- 1. Buckets (private; MIME + size enforced at the bucket AND by policy)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('lesson-media', 'lesson-media', false, 52428800,
   array['image/png','image/jpeg','image/webp','audio/mpeg','audio/mp4','application/pdf']),
  ('source-documents', 'source-documents', false, 20971520,
   array['application/pdf','text/plain','text/markdown']),
  ('assessment-submissions', 'assessment-submissions', false, 52428800,
   array['application/pdf','image/png','image/jpeg','text/plain'])
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Strict path parsers (null = deny; malformed paths never resolve)
-- ---------------------------------------------------------------------------
create or replace function app.lesson_media_org_id(p_name text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when p_name ~ '^organizations/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/lesson-media/[A-Za-z0-9][A-Za-z0-9._-]{0,199}$'
      then split_part(p_name, '/', 2)::uuid
  end;
$$;

create or replace function app.source_document_org_id(p_name text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when p_name ~ '^organizations/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/sources/[A-Za-z0-9][A-Za-z0-9._-]{0,199}$'
      then split_part(p_name, '/', 2)::uuid
  end;
$$;

-- submissions: organizations/<org>/submissions/<membership>/<attempt>/<file>
create or replace function app.submission_org_id(p_name text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when p_name ~ '^organizations/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/submissions/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[A-Za-z0-9][A-Za-z0-9._-]{0,199}$'
      then split_part(p_name, '/', 2)::uuid
  end;
$$;

create or replace function app.submission_membership_id(p_name text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when app.submission_org_id(p_name) is not null
      then split_part(p_name, '/', 4)::uuid
  end;
$$;

revoke all on function app.lesson_media_org_id(text) from public, anon;
revoke all on function app.source_document_org_id(text) from public, anon;
revoke all on function app.submission_org_id(text) from public, anon;
revoke all on function app.submission_membership_id(text) from public, anon;
grant execute on function app.lesson_media_org_id(text) to authenticated;
grant execute on function app.source_document_org_id(text) to authenticated;
grant execute on function app.submission_org_id(text) to authenticated;
grant execute on function app.submission_membership_id(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Object policies (signed-URL creation requires SELECT; uploads are
--    immutable — replacement writes a new path; no UPDATE/DELETE policies)
-- ---------------------------------------------------------------------------

-- Lesson media: any org member may read (learners render it); authors write.
create policy lesson_media_objects_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'lesson-media'
    and app.is_org_member(app.lesson_media_org_id(name))
  );
create policy lesson_media_objects_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'lesson-media'
    and app.has_org_permission(app.lesson_media_org_id(name), 'content.author')
  );

-- Source documents: staff-only in both directions.
create policy source_documents_objects_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'source-documents'
    and app.has_org_permission(app.source_document_org_id(name), 'content.view_draft')
  );
create policy source_documents_objects_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'source-documents'
    and app.has_org_permission(app.source_document_org_id(name), 'sources.manage')
  );

-- Submissions: uploaders write ONLY under their own membership path;
-- readers are the uploader and graders in the same organization.
create policy submissions_objects_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'assessment-submissions'
    and (
      app.has_org_permission(app.submission_org_id(name), 'assessment.grade')
      or exists (
        select 1 from public.organization_memberships m
        where m.id = app.submission_membership_id(name)
          and m.user_id = (select auth.uid())
      )
    )
  );
create policy submissions_objects_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'assessment-submissions'
    and exists (
      select 1 from public.organization_memberships m
      where m.id = app.submission_membership_id(name)
        and m.user_id = (select auth.uid())
        and m.status = 'active'
    )
  );

-- ---------------------------------------------------------------------------
-- 4. media_assets gains the Studio content kinds + buckets (record of truth
--    for lesson media and source files per ADR-015)
-- ---------------------------------------------------------------------------
alter table public.media_assets drop constraint media_assets_asset_kind_check;
alter table public.media_assets
  add constraint media_assets_asset_kind_check
  check (asset_kind in (
    'logo_horizontal', 'logo_horizontal_inverse', 'monogram', 'favicon',
    'app_icon', 'email_logo', 'content_image',
    'lesson_image', 'lesson_audio', 'lesson_pdf', 'source_document'
  ));
alter table public.media_assets drop constraint media_assets_storage_bucket_check;
alter table public.media_assets
  add constraint media_assets_storage_bucket_check
  check (storage_bucket in (
    'org-branding', 'platform-branding', 'lesson-media', 'source-documents'
  ));

-- ---------------------------------------------------------------------------
-- 5. register_submission_file: metadata anchored to org, attempt, response,
--    and uploader — called AFTER a successful path-scoped upload.
-- ---------------------------------------------------------------------------
create or replace function public.register_submission_file(
  p_attempt_id uuid,
  p_item_id uuid,
  p_storage_path text,
  p_file_name text,
  p_mime_type text,
  p_byte_size integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_at record;
  v_response_id uuid;
  v_id uuid;
begin
  select * into v_at from public.assessment_attempts where id = p_attempt_id;
  if v_at.id is null then
    raise exception 'attempt not found' using errcode = 'P0002';
  end if;
  if not exists (
    select 1 from public.organization_memberships m
    where m.id = v_at.membership_id and m.user_id = (select auth.uid())
      and m.status = 'active'
  ) then
    raise exception 'you can only attach files to your own attempt' using errcode = '42501';
  end if;
  if v_at.status <> 'started' then
    raise exception 'files are locked after submission' using errcode = '23514';
  end if;
  -- the storage path must be THIS org + THIS membership + THIS attempt
  if app.submission_org_id(p_storage_path) is distinct from v_at.organization_id
     or app.submission_membership_id(p_storage_path) is distinct from v_at.membership_id
     or split_part(p_storage_path, '/', 5) is distinct from p_attempt_id::text then
    raise exception 'storage path does not match this attempt' using errcode = '23514';
  end if;

  select id into v_response_id from public.assessment_responses
   where attempt_id = p_attempt_id and item_id = p_item_id;

  insert into public.assessment_submission_files
    (organization_id, attempt_id, response_id, item_id, membership_id,
     storage_path, file_name, mime_type, byte_size, status)
  values
    (v_at.organization_id, p_attempt_id, v_response_id, p_item_id,
     v_at.membership_id, p_storage_path, p_file_name, p_mime_type,
     p_byte_size, 'active')
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.register_submission_file(uuid, uuid, text, text, text, integer) from public, anon;
grant execute on function public.register_submission_file(uuid, uuid, text, text, text, integer) to authenticated;
