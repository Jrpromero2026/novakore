-- audit_logs.action must match '^[a-z_]+\.[a-z_]+$' (dotted domain.verb).
-- The ai-budget audit trigger wrote bare 'created'/'updated', violating the
-- CHECK on every budget write. Use the dotted form.
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
    case when tg_op = 'INSERT' then 'ai_budget.created' else 'ai_budget.updated' end,
    'ai_budget', new.organization_id::text,
    jsonb_build_object('monthly_limit_cents', new.monthly_limit_cents)
  );
  return new;
end;
$$;
