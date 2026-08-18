-- Terminology drift, computed in Postgres.
--
-- This is the SECOND reader of the per-render block scan. Nova pulled every
-- block's JSONB partly to count words (now a stored column) and partly to
-- concatenate lesson prose and ask "does this lesson still use a word the
-- organization renamed?". Leaving this one behind would keep both the
-- payload and the silent `.limit(5000)` truncation, so it moves too.

-- Mirrors `textOf` in apps/web/src/lib/data/nova.ts: prose only, with `id`,
-- `*Id` and `url` treated as machine values.
create or replace function app.content_block_text(p_value jsonb)
returns text
language plpgsql
immutable
parallel safe
set search_path = ''
as $fn$
declare
  v_out text := '';
  v_elem jsonb;
  v_key text;
  v_val jsonb;
begin
  if p_value is null then
    return '';
  end if;

  case jsonb_typeof(p_value)
    when 'string' then
      return (p_value #>> '{}') || ' ';
    when 'array' then
      for v_elem in select * from jsonb_array_elements(p_value) loop
        v_out := v_out || app.content_block_text(v_elem);
      end loop;
      return v_out;
    when 'object' then
      for v_key, v_val in select * from jsonb_each(p_value) loop
        if v_key = 'id' or v_key = 'url' or v_key like '%Id' then
          continue;
        end if;
        v_out := v_out || app.content_block_text(v_val);
      end loop;
      return v_out;
    else
      return '';
  end case;
end;
$fn$;

comment on function app.content_block_text(jsonb) is
  'Prose text of a content block payload, machine fields removed. Mirrors textOf in apps/web/src/lib/data/nova.ts; equivalence pinned by a real-DB test.';

-- Returns one row per requested term with the number of lessons whose prose
-- still uses it. The caller supplies the terms because which words count as
-- "canonical" depends on the organization's terminology overrides, which the
-- app already holds.
create or replace function public.org_lesson_term_usage(
  p_organization_id uuid,
  p_terms text[]
)
returns table (term text, lesson_count integer)
language plpgsql
stable
security definer
set search_path = public, app, extensions
as $$
begin
  if not app.has_org_permission(p_organization_id, 'content.view_draft') then
    return;
  end if;

  if p_terms is null or array_length(p_terms, 1) is null then
    return;
  end if;

  return query
  with lesson_text as (
    select cb.lesson_id,
           string_agg(app.content_block_text(cb.data), ' ') as txt
      from public.content_blocks cb
     where cb.organization_id = p_organization_id
     group by cb.lesson_id
  )
  select t.term,
         count(lt.lesson_id)::integer
    from unnest(p_terms) as t(term)
    left join lesson_text lt
      -- `\y` is Postgres's word boundary, matching JavaScript's `\b`; the
      -- optional trailing `s` and the `\s+` for multi-word terms mirror the
      -- expression the app used to build.
      on lt.txt ~* ('\y' || replace(t.term, ' ', '\s+') || 's?\y')
   group by t.term;
end;
$$;

revoke all on function public.org_lesson_term_usage(uuid, text[]) from public, anon;
grant execute on function public.org_lesson_term_usage(uuid, text[]) to authenticated;
