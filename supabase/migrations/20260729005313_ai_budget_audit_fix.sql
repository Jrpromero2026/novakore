-- studio_foundation attached the generic app.audit_change trigger to
-- ai_budgets, whose else-branch reads new.id — but ai_budgets' primary key
-- is organization_id (no id column), so any write raised 42703. Replace the
-- generic trigger with a dedicated audit that keys on organization_id
-- (the same pattern organization_branding uses).
drop trigger audit_change on public.ai_budgets;

create or replace function app.audit_ai_budget()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.audit_logs
    (organization_id, actor_user_id, action, target_type, target_id, metadata)
  values (
    new.organization_id, (select auth.uid()),
    case when tg_op = 'INSERT' then 'created' else 'updated' end,
    'ai_budget', new.organization_id::text,
    jsonb_build_object('monthly_limit_cents', new.monthly_limit_cents)
  );
  return new;
end;
$$;

create trigger audit_ai_budget after insert or update on public.ai_budgets
  for each row execute function app.audit_ai_budget();
