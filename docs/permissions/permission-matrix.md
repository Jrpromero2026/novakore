# Permission Matrix

The platform-defined, finite permission catalog (24 codes) × the nine
system roles seeded for every organization. Sources of truth:
`packages/domain/src/permissions.ts` (catalog, parity-tested against the
migrations) and `app.create_system_roles` (bundles — last revised in
migration `20260728214840`). Tenants compose custom roles from these
codes but can never mint new ones; system-role bundles are
trigger-protected against tenant edits.

Owner = `organization_owner`, Admin = `organization_admin`,
AcadAdmin = `academy_admin`. Owner and Admin hold every permission.

| Permission               | Owner | Admin | AcadAdmin | Author | Reviewer | Instructor | Manager | Learner | Observer |
| ------------------------ | :---: | :---: | :-------: | :----: | :------: | :--------: | :-----: | :-----: | :------: |
| `org.manage`             |   ✓   |   ✓   |     —     |   —    |    —     |     —      |    —    |    —    |    —     |
| `org.members.manage`     |   ✓   |   ✓   |     —     |   —    |    —     |     —      |    —    |    —    |    —     |
| `org.roles.manage`       |   ✓   |   ✓   |     —     |   —    |    —     |     —      |    —    |    —    |    —     |
| `org.branding.manage`    |   ✓   |   ✓   |     —     |   —    |    —     |     —      |    —    |    —    |    —     |
| `org.branding.publish`   |   ✓   |   ✓   |     —     |   —    |    —     |     —      |    —    |    —    |    —     |
| `org.terminology.manage` |   ✓   |   ✓   |     —     |   —    |    —     |     —      |    —    |    —    |    —     |
| `academy.manage`         |   ✓   |   ✓   |     ✓     |   —    |    —     |     —      |    —    |    —    |    —     |
| `content.view_draft`     |   ✓   |   ✓   |     ✓     |   ✓    |    ✓     |     ✓      |    —    |    —    |    —     |
| `content.author`         |   ✓   |   ✓   |     ✓     |   ✓    |    —     |     —      |    —    |    —    |    —     |
| `content.publish`        |   ✓   |   ✓   |     ✓     |   —    |    ✓     |     —      |    —    |    —    |    —     |
| `content.archive`        |   ✓   |   ✓   |     ✓     |   —    |    —     |     —      |    —    |    —    |    —     |
| `paths.manage`           |   ✓   |   ✓   |     ✓     |   ✓    |    —     |     —      |    —    |    —    |    —     |
| `assessment.author`      |   ✓   |   ✓   |     ✓     |   ✓    |    —     |     —      |    —    |    —    |    —     |
| `assessment.grade`       |   ✓   |   ✓   |     ✓     |   —    |    ✓     |     ✓      |    —    |    —    |    —     |
| `enrollment.manage`      |   ✓   |   ✓   |     ✓     |   —    |    —     |     ✓      |    ✓    |    —    |    —     |
| `enrollment.self`        |   ✓   |   ✓   |     ✓     |   ✓    |    ✓     |     ✓      |    ✓    |    ✓    |    —     |
| `progress.view.own`      |   ✓   |   ✓   |     ✓     |   ✓    |    ✓     |     ✓      |    ✓    |    ✓    |    —     |
| `progress.view.others`   |   ✓   |   ✓   |     ✓     |   —    |    —     |     ✓      |    ✓    |    —    |    ✓     |
| `progress.override`      |   ✓   |   ✓   |     —     |   —    |    —     |     —      |    —    |    —    |    —     |
| `certificates.manage`    |   ✓   |   ✓   |     —     |   —    |    —     |     —      |    —    |    —    |    —     |
| `analytics.view`         |   ✓   |   ✓   |     ✓     |   —    |    —     |     ✓      |    ✓    |    —    |    ✓     |
| `audit.view`             |   ✓   |   ✓   |     —     |   —    |    —     |     —      |    —    |    —    |    —     |
| `integrations.manage`    |   ✓   |   ✓   |     —     |   —    |    —     |     —      |    —    |    —    |    —     |
| `ai.author.use`          |   ✓   |   ✓   |     ✓     |   ✓    |    —     |     —      |    —    |    —    |    —     |

## Design notes

- **Author vs Reviewer split is deliberate:** authors hold
  `content.author` but not `content.publish`; reviewers hold
  `content.publish` but not `content.author`. Publishing is a distinct
  act everywhere (mirrors `org.branding.manage` vs
  `org.branding.publish`).
- **`progress.override` is owner/admin only by default** (Phase 1C —
  audited manual override with mandatory reason). Tenants may grant it
  to custom roles; academy-scoped delegation is an open decision.
- **Learner is minimal by construction:** self-enrollment where allowed
  and own-progress visibility. Everything learners can do flows through
  RLS self-scoping plus `record_lesson_progress`'s internal checks —
  no staff permission ever gates a learner's own learning.
- Permission changes require: catalog update in `permissions.ts`,
  `public.permissions` seed row, bundle revision via a new
  `app.create_system_roles` definition **plus** a backfill insert for
  existing orgs' system roles (pattern: migrations `20260728151839`,
  `20260728203155` + `20260728214840`), and this matrix.
