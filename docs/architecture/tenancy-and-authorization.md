# Tenancy and Authorization

## 1. Tenancy model

- **The organization is the isolation boundary.** Every tenant-scoped row
  carries `organization_id`. Academies subdivide an organization for access
  scoping but are not isolation boundaries.
- **Users are global; membership is tenant-scoped.** One auth identity may
  hold memberships in many organizations (a coach can be an author in one org
  and a learner in another). All tenant data hangs off the membership, never
  directly off the user.
- **Platform administrators are not members.** NovaKore staff exist in
  `platform_admins` with separate permissions, separate audit, and no implicit
  read of tenant content (see §8).

## 2. Authorization model: permissions first, roles as bundles

Rigid role hierarchies break the moment a tenant says "our reviewers also
teach." NovaKore therefore authorizes on **permissions**; roles are named,
tenant-visible bundles of permissions.

- `permissions` — platform-defined catalog. Additive-only; tenants cannot
  create permissions (prevents permission sprawl, keeps RLS predicates
  finite).
- `organization_roles` — system-seeded roles (below) plus tenant-custom roles.
  System roles are updatable by the platform (new permissions can be added to
  bundles in migrations); tenant-custom roles are tenant-managed.
- `member_role_assignments` — membership × role, with optional `academy_id`
  scope. `academy_id = NULL` ⇒ org-wide. A member may hold many assignments.

**Effective permission check** (the only authorization primitive in the
codebase):

```
can(userId, orgId, permission, { academyId? }) =>
  membership is active
  AND ∃ assignment: role grants permission
      AND (assignment.academy_id IS NULL OR assignment.academy_id = academyId)
```

## 3. Permission catalog (Phase 1 set)

Namespaced, additive-only. Phase 1 ships exactly these; later phases add codes
(never repurpose).

| Code                     | Meaning                                                |
| ------------------------ | ------------------------------------------------------ |
| `org.manage`             | Edit org profile/settings; manage academies            |
| `org.members.manage`     | Invite, suspend, remove members                        |
| `org.roles.manage`       | Create/edit custom roles and assignments               |
| `org.branding.manage`    | Edit branding/theme                                    |
| `org.terminology.manage` | Edit terminology overrides                             |
| `academy.manage`         | Create/edit academies (org-wide) or the scoped academy |
| `content.view_draft`     | See unpublished content                                |
| `content.author`         | Create/edit draft courses, modules, lessons, blocks    |
| `content.publish`        | Publish/unpublish versions                             |
| `content.archive`        | Archive content                                        |
| `paths.manage`           | Author learning paths, nodes, prerequisites            |
| `assessment.author`      | Author assessments/items                               |
| `assessment.grade`       | Grade attempts, view responses                         |
| `enrollment.manage`      | Enroll/withdraw others; manage cohorts                 |
| `enrollment.self`        | Self-enroll where allowed                              |
| `progress.view.own`      | See own progress                                       |
| `progress.view.others`   | See others' progress (scoped by academy assignment)    |
| `certificates.manage`    | Templates, issuance definitions, revocation            |
| `analytics.view`         | Org/academy analytics dashboards                       |
| `audit.view`             | Read audit log                                         |
| `integrations.manage`    | Connections, webhooks, API keys                        |
| `ai.author.use`          | Use AI authoring tools                                 |

Later phases add: `assessment.review_appeals`, `competencies.manage`,
`ai.tutor.use` (learner AI), `rules.manage`, `data.export`, etc.

## 4. System roles → permission matrix (Phase 1)

✔ = granted by the seeded system role. Tenants may clone and adjust.

| Permission             | Owner | Org admin | Academy admin* | Author | Instructor | Reviewer | Manager | Learner | Observer |
| ---------------------- | :---: | :-------: | :------------: | :----: | :--------: | :------: | :-----: | :-----: | :------: |
| org.manage             |   ✔   |     ✔     |                |        |            |          |         |         |          |
| org.members.manage     |   ✔   |     ✔     |                |        |            |          |         |         |          |
| org.roles.manage       |   ✔   |     ✔     |                |        |            |          |         |         |          |
| org.branding.manage    |   ✔   |     ✔     |                |        |            |          |         |         |          |
| org.terminology.manage |   ✔   |     ✔     |                |        |            |          |         |         |          |
| academy.manage         |   ✔   |     ✔     |       ✔*       |        |            |          |         |         |          |
| content.view_draft     |   ✔   |     ✔     |       ✔*       |   ✔    |     ✔      |    ✔     |         |         |          |
| content.author         |   ✔   |     ✔     |       ✔*       |   ✔    |            |          |         |         |          |
| content.publish        |   ✔   |     ✔     |       ✔*       |        |            |    ✔     |         |         |          |
| content.archive        |   ✔   |     ✔     |       ✔*       |        |            |          |         |         |          |
| paths.manage           |   ✔   |     ✔     |       ✔*       |   ✔    |            |          |         |         |          |
| assessment.author      |   ✔   |     ✔     |       ✔*       |   ✔    |            |          |         |         |          |
| assessment.grade       |   ✔   |     ✔     |       ✔*       |        |     ✔      |    ✔     |         |         |          |
| enrollment.manage      |   ✔   |     ✔     |       ✔*       |        |     ✔      |          |    ✔    |         |          |
| enrollment.self        |   ✔   |     ✔     |       ✔        |   ✔    |     ✔      |    ✔     |    ✔    |    ✔    |          |
| progress.view.own      |   ✔   |     ✔     |       ✔        |   ✔    |     ✔      |    ✔     |    ✔    |    ✔    |          |
| progress.view.others   |   ✔   |     ✔     |       ✔*       |        |     ✔*     |          |   ✔*    |         |    ✔*    |
| certificates.manage    |   ✔   |     ✔     |                |        |            |          |         |         |          |
| analytics.view         |   ✔   |     ✔     |       ✔*       |        |     ✔*     |          |   ✔*    |         |    ✔*    |
| audit.view             |   ✔   |     ✔     |                |        |            |          |         |         |          |
| integrations.manage    |   ✔   |     ✔     |                |        |            |          |         |         |          |
| ai.author.use          |   ✔   |     ✔     |       ✔*       |   ✔    |            |          |         |         |          |

\* Academy-scoped: effective only within academies named in the member's role
assignment. **Author deliberately lacks `content.publish`** — publishing is a
separate act (reviewer/admin), which is the review workflow's backbone.
**Observer** is read-only reporting (e.g. a franchise stakeholder): analytics
and others' progress in scope, no content or learner PII beyond progress
aggregates (enforced server-side by the analytics query layer, not just UI).

## 5. Boundary rules

- **Cross-organization isolation is absolute.** No query path, API response,
  AI retrieval, or analytics aggregate may span organizations. The only
  cross-org actor is the platform layer itself.
- **Academy access**: content structures under an academy
  (systems/paths) and academy-scoped people operations honor the
  `academy_id` on role assignments. Org-level entities (courses, assessments)
  are visible to any member holding the relevant org-wide permission.
- **Learner-data access** requires `progress.view.others` and is
  academy-scoped for instructors/managers/observers. Graded responses
  additionally require `assessment.grade`.
- **Enrollment permissions**: self-enrollment is per-target opt-in
  (`allow_self_enrollment` flag) and still requires `enrollment.self`.

## 6. Terminology and branding as tenant configuration

Terminology overrides and branding live in tenant configuration tables
(Phase 1A) guarded by their permissions above. Terminology resolution is a
pure function: `display(termKey) = org_override ?? platform_default` — cached
per org, invalidated on write, never blocking a request on a network call.
Canonical keys are the frozen list in `@novakore/domain`.

## 7. Enforcement layers (defense in depth)

Authorization is enforced at **three layers**; no decision may rely on hidden
UI controls (layer 3 is convenience only):

1. **PostgreSQL RLS (coarse tenant isolation).**
   - Every tenant table: `USING (organization_id IN (select from active
memberships of auth.uid()))` via a `SECURITY DEFINER` helper
     (`app.member_org_ids()`), plus platform-admin bypass policies where
     justified and audited.
   - Learner-sensitive tables (attempts, responses, progress, credentials)
     additionally restrict SELECT to the owning member or holders of the
     relevant permission via `app.has_permission(org_id, code)` helpers.
   - RLS is the safety net that makes a leaked anon key or a buggy query
     _not_ a cross-tenant breach.
2. **Server-side authorization (fine-grained, authoritative).**
   - All mutations flow through server code (route handlers / server
     actions) that call `can()` before touching the database — even though
     RLS also applies. Publishing, grading, enrollment management, exports,
     and anything with business rules are decided here.
   - The Supabase **service-role key exists only in server environment
     config**, is never shipped client-side, and is used only by narrow,
     named internal operations (migrations, webhook dispatch, event writes)
     — each of which must perform its own explicit org-scope filtering
     because RLS does not protect service-role queries.
3. **UI affordances** reflect (never define) permissions.

## 8. Platform administration, audit, impersonation

- **Platform-level permissions** (tenant provisioning, suspension, platform
  config) are held by `platform_admins` and never expressible in tenant
  roles.
- **Audit requirements** (`audit_logs`, Phase 1A): every authz-relevant event
  — membership/role changes, permission grants, publishes, credential
  issuance/revocation, exports, integration credential changes, platform-admin
  access to tenant data — with actor, org, subject, before/after summary,
  timestamp. Append-only.
- **Impersonation** (if ever supported): platform-admin-only; requires a
  recorded reason; time-boxed session; banner visible in UI; every action
  double-logged (actor = admin, on_behalf_of = user); tenant owner is
  notifiable. Until built, support debugging uses RLS-respecting read tooling,
  not shared credentials.

## 9. Session and claims strategy

JWT carries only identity (`sub`). Membership, roles, and permissions are
**resolved server-side per request** (cached briefly), not baked into token
claims — role changes must take effect without waiting out token expiry.
Custom claims may later be added as a _cache_ for RLS ergonomics, never as the
source of truth. Final mechanics are confirmed against current Supabase Auth
documentation when Supabase is introduced (Phase 1A gate).
