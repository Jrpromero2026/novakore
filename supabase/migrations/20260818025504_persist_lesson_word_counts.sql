-- Persist per-block word counts so Nova stops shipping every lesson's JSONB
-- to the app to count words in JavaScript.
--
-- The previous read pulled `content_blocks.data` for up to 5000 blocks per
-- organization on every Nova render. That was O(content) over the wire and,
-- past the limit, silently WRONG — the same defect class the analytics
-- rollups closed: an arbitrary subset counted with total confidence.

-- The word-counting rule, mirroring lib/lesson-health.ts exactly:
--   string  -> split on whitespace, ignore empty parts
--   array   -> sum of elements
--   object  -> sum of values, SKIPPING `id`, `*Id`, and `url` (machine
--              values, not prose)
--   other   -> 0
--
-- The whitespace class is written out explicitly rather than as `\s`. That
-- is deliberate: Postgres's `\s` and JavaScript's `\s` do not agree, and the
-- difference runs BOTH ways — Postgres splits on U+0085 (NEL) where
-- JavaScript does not, and JavaScript splits on U+FEFF where Postgres does
-- not. Using `\s` would also make the count depend on server collation, so
-- the same content could score differently on another instance. The literal
-- class below is exactly JavaScript's WhiteSpace + LineTerminator set, and
-- is therefore deterministic everywhere.
create or replace function app.count_content_words(p_value jsonb)
returns integer
language plpgsql
immutable
parallel safe
set search_path = ''
as $fn$
declare
  v_total integer := 0;
  v_elem  jsonb;
  v_key   text;
  v_val   jsonb;
begin
  if p_value is null then
    return 0;
  end if;

  case jsonb_typeof(p_value)
    when 'string' then
      return coalesce(
        array_length(
          array_remove(
            regexp_split_to_array(
              p_value #>> '{}',
              U&'[\0009\000A\000B\000C\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]+'
            ),
            ''
          ),
          1
        ),
        0
      );
    when 'array' then
      for v_elem in select * from jsonb_array_elements(p_value) loop
        v_total := v_total + app.count_content_words(v_elem);
      end loop;
      return v_total;
    when 'object' then
      for v_key, v_val in select * from jsonb_each(p_value) loop
        if v_key = 'id' or v_key = 'url' or v_key like '%Id' then
          continue;
        end if;
        v_total := v_total + app.count_content_words(v_val);
      end loop;
      return v_total;
    else
      return 0;
  end case;
end;
$fn$;

comment on function app.count_content_words(jsonb) is
  'Prose word count for a content block payload. Mirrors countContentWords in apps/web/src/lib/lesson-health.ts; the equivalence is pinned by a real-DB test. Changing this function does NOT recompute content_blocks.word_count for existing rows — see the migration notes.';

-- Stored, not computed on read: the cost moves to save time, and it is
-- maintained for EVERY write path (editor, Studio library, AI authoring,
-- seeds, manual SQL) rather than only the ones the app remembers to update.
alter table public.content_blocks
  add column if not exists word_count integer
  generated always as (app.count_content_words(data)) stored;

comment on column public.content_blocks.word_count is
  'Generated prose word count of `data`. Recomputed by Postgres on every insert/update of the row.';

-- One row per lesson instead of one per block, and no row limit — which is
-- what actually retires the silent-truncation bug.
create or replace function public.org_lesson_word_counts(p_organization_id uuid)
returns table (lesson_id uuid, words integer)
language plpgsql
stable
security definer
set search_path = public, app, extensions
as $$
begin
  -- Fail closed: a caller without draft visibility gets an empty set, never
  -- a partial one. Callers already gate on this permission; the re-check
  -- here is the boundary that actually enforces it.
  if not app.has_org_permission(p_organization_id, 'content.view_draft') then
    return;
  end if;

  return query
    select cb.lesson_id, sum(cb.word_count)::integer
      from public.content_blocks cb
     where cb.organization_id = p_organization_id
     group by cb.lesson_id;
end;
$$;

revoke all on function public.org_lesson_word_counts(uuid) from public, anon;
grant execute on function public.org_lesson_word_counts(uuid) to authenticated;
