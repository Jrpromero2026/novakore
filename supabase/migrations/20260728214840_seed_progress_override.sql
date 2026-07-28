-- Phase 1C follow-up: 20260728203155 granted progress.override to the
-- owner/admin system roles of EXISTING organizations but did not update
-- app.create_system_roles, so organizations provisioned afterwards would
-- miss it. Redefine the seed bundles (same pattern as the org.branding.publish
-- rollout in 20260728151839).
create or replace function app.create_system_roles(p_organization_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role_id uuid;
  v_def record;
begin
  perform pg_catalog.set_config('app.system_role_maintenance', 'true', true);

  for v_def in
    select * from (values
      ('organization_owner', 'Organization Owner',
        'Full control of the organization.',
        array['org.manage','org.members.manage','org.roles.manage','org.branding.manage','org.branding.publish','org.terminology.manage','academy.manage','content.view_draft','content.author','content.publish','content.archive','paths.manage','assessment.author','assessment.grade','enrollment.manage','enrollment.self','progress.view.own','progress.view.others','progress.override','certificates.manage','analytics.view','audit.view','integrations.manage','ai.author.use']),
      ('organization_admin', 'Organization Admin',
        'Administers the organization on the owner''s behalf.',
        array['org.manage','org.members.manage','org.roles.manage','org.branding.manage','org.branding.publish','org.terminology.manage','academy.manage','content.view_draft','content.author','content.publish','content.archive','paths.manage','assessment.author','assessment.grade','enrollment.manage','enrollment.self','progress.view.own','progress.view.others','progress.override','certificates.manage','analytics.view','audit.view','integrations.manage','ai.author.use']),
      ('academy_admin', 'Academy Admin',
        'Administers assigned academies.',
        array['academy.manage','content.view_draft','content.author','content.publish','content.archive','paths.manage','assessment.author','assessment.grade','enrollment.manage','enrollment.self','progress.view.own','progress.view.others','analytics.view','ai.author.use']),
      ('author', 'Author',
        'Creates and edits draft content. Publishing requires a separate role.',
        array['content.view_draft','content.author','paths.manage','assessment.author','enrollment.self','progress.view.own','ai.author.use']),
      ('reviewer', 'Reviewer',
        'Reviews and publishes content.',
        array['content.view_draft','content.publish','assessment.grade','enrollment.self','progress.view.own']),
      ('instructor', 'Instructor',
        'Teaches and grades within scope.',
        array['content.view_draft','assessment.grade','enrollment.manage','enrollment.self','progress.view.own','progress.view.others','analytics.view']),
      ('manager', 'Manager',
        'Manages learners'' enrollment and progress visibility.',
        array['enrollment.manage','enrollment.self','progress.view.own','progress.view.others','analytics.view']),
      ('learner', 'Learner',
        'Learns.',
        array['enrollment.self','progress.view.own']),
      ('observer', 'Observer',
        'Read-only reporting within scope.',
        array['progress.view.others','analytics.view'])
    ) as defs(key, name, description, permission_codes)
  loop
    insert into public.organization_roles (organization_id, key, name, description, is_system, created_by)
    values (p_organization_id, v_def.key, v_def.name, v_def.description, true, (select auth.uid()))
    returning id into v_role_id;

    insert into public.organization_role_permissions (organization_id, role_id, permission_code, created_by)
    select p_organization_id, v_role_id, code, (select auth.uid())
    from unnest(v_def.permission_codes) as code;
  end loop;
end;
$$;
