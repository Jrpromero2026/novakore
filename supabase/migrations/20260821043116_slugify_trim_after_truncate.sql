-- Truncation has to happen BEFORE the hyphens are trimmed, not after. Cutting
-- a long name at 63 characters can land mid-word and reintroduce the trailing
-- hyphen that the organizations_slug_check forbids, so the previous order
-- produced an invalid slug for any name long enough to be cut.

create or replace function app.slugify(p_text text)
returns text
language sql
immutable
set search_path to ''
as $$
  select trim(both '-' from
    left(
      regexp_replace(
        regexp_replace(lower(coalesce(p_text, '')), '[^a-z0-9]+', '-', 'g'),
        '-+', '-', 'g'
      ),
      63
    )
  )
$$;
