-- Fix: the audit trigger was created without its target-type argument.
--
-- `app.audit_change()` reads `tg_argv[0]` into `audit_logs.target_type`,
-- which is NOT NULL — so every insert on content_templates failed with
-- 23502 rather than writing an audit row. Caught by the real-DB test, which
-- is the only place it could be caught: the column is fine, the table is
-- fine, and only an actual write through the trigger reveals it.
--
-- Singular noun to match every other table ('academy', 'reusable_block').
drop trigger if exists audit_change on public.content_templates;

create trigger audit_change
  after insert or update on public.content_templates
  for each row execute function app.audit_change('content_template');
