-- The first list was six generic SaaS segments. Two of them, "corporate
-- training" and "education", were too vague to drive any setup, and
-- "association" described a kind of customer rather than a thing they do —
-- an association might be doing any of three others.
--
-- This list is longer on purpose. NovaKore is learning infrastructure: the
-- choice sets defaults and removes nothing, so picking wrong costs nothing,
-- and a fuller list is a better map of what the platform can do. It doubles
-- as documentation. A short list would only be right if the choice locked
-- something, and it must not.
--
-- The vocabulary each one seeds lives in the domain package, not here, so
-- there is one definition of what an SOP or a CEU Credit is called rather
-- than a copy in SQL drifting from a copy in TypeScript.

alter table public.organizations
  drop constraint if exists organizations_use_case_check;

alter table public.organizations
  add constraint organizations_use_case_check check (
    use_case is null or use_case in (
      'certification',
      'continuing_education',
      'customer_academy',
      'staff_onboarding',
      'compliance',
      'coaching',
      'partner_network',
      'school',
      'membership',
      'unspecified'
    )
  );

comment on column public.organizations.use_case is
  'What the organization said it came here to do, captured at signup. Seeds terminology defaults and filters setup guidance. Grants and restricts nothing; every default it sets is editable afterwards.';
