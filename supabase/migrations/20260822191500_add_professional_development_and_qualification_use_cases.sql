-- Two use cases added after review, each because it implies a genuinely
-- different vocabulary rather than naming another customer segment:
--
--   professional_development — structured growth and upskilling that issues a
--   completion record rather than formal credit or a certification. Distinct
--   from staff_onboarding (procedures, not growth) and from
--   continuing_education (no external credit body).
--
--   qualification — proving a person can perform work to a defined standard,
--   with named human assessment. Distinct from compliance, where the question
--   is "did they complete the training" rather than "can they do the work".
--   Maps onto competency and named sign-off, which the platform already has.
--
-- Nothing is removed; every previously valid value remains valid, so existing
-- organizations stay valid without migration.

alter table public.organizations
  drop constraint if exists organizations_use_case_check;

alter table public.organizations
  add constraint organizations_use_case_check check (
    use_case is null or use_case in (
      'staff_onboarding',
      'professional_development',
      'qualification',
      'compliance',
      'continuing_education',
      'certification',
      'coaching',
      'customer_academy',
      'partner_network',
      'school',
      'membership',
      'unspecified'
    )
  );
