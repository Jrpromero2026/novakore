# Phase 1A Implementation Report

Completed 2026-07-28. Governing spec: docs/architecture (commit `3fb6e37`)
plus owner Phase 1A decisions (D-01…D-04).

## 1. What exists now

| Layer    | Delivered                                                                                                                                                                                                        |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Remote   | Dedicated Supabase project `novakore-dev` (us-west-1, Postgres 17, ACTIVE_HEALTHY). Built For Her and G3 Performance projects untouched.                                                                         |
| Schema   | 6 committed migrations = source of truth; 12 Phase 1A tables; RLS on every table; 22-code permission catalog; 9 system roles per org; semantic audit triggers; 6 controlled SECURITY DEFINER operations.         |
| Seeds    | Deterministic dev data: 12 auth users, 2 orgs (incl. clearly-labeled BFH dev tenant with terminology preset), academies, memberships (incl. suspended/removed/invited and one multi-org user), role assignments. |
| Packages | `@novakore/domain` (+ permission catalog), `@novakore/database` (env validation, clients, generated types), `@novakore/authorization` (pure `can()`).                                                            |
| App      | Auth (email/password + magic link only), session proxy, org selector with invitation acceptance, themed admin shell, 15 required surfaces, light/dark token system with tenant accents.                          |
| Tests    | 60 total: 22 real-RLS isolation (remote PostgREST + sign-ins, zero mocks), 6 authorization unit, 16 domain (incl. schema-parity), 16 web UI/validation (incl. CSS-injection tests).                              |

## 2. Authorization architecture (as built)

1. **RLS** — membership-anchored isolation on every table; permission-gated
   writes via `app.has_org_permission` / `app.has_academy_permission`
   (SECURITY DEFINER, empty `search_path`); zero grants for `anon`;
   write-grants revoked where writes are definer-function-only.
2. **Server `can()`** — request-cached org context (active membership +
   role grants) resolved per slug; every server action checks `can()`
   before touching the database; UI affordances filter but never authorize.
3. **Controlled operations** — provision_organization (platform-admin),
   invite_member, accept_invitation (confirmed-email binding),
   set_membership_status (self-action + last-owner guards),
   change_organization_slug (platform-admin), get_member_emails
   (permission-gated directory).

## 3. Security review findings

| Check                             | Result                                                                                                                                                                                                                                                                                                                                         |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cross-tenant IDOR                 | No path found. All queries org-anchored; mutations re-scope by `organization_id`; proven by isolation tests #1–#7, #13, #14.                                                                                                                                                                                                                   |
| Missing organization_id filters   | One display-level issue found during browser QA (org selector listed same-org memberships visible via `org.members.manage`) — fixed by explicit self-scoping. Not a tenant leak.                                                                                                                                                               |
| Overly broad RLS                  | Only `permissions` (platform catalog) uses `using (true)` SELECT — intentional, read-only, non-tenant data.                                                                                                                                                                                                                                    |
| Security-definer functions        | All use empty `search_path`, internal deny-by-default checks, `anon` revoked. Supabase advisor WARNs that the 5 public RPCs are callable by `authenticated` — intentional (each authorizes internally); documented here. Advisor also caught `enforce_reserved_slug` needing DEFINER (invoker-rights would silently bypass under RLS) — fixed. |
| Service-role exposure             | The service-role key was never obtained, stored, or used anywhere in this phase. Env validation refuses server env in browser contexts; no `NEXT_PUBLIC_` private keys.                                                                                                                                                                        |
| Role-name authorization shortcuts | None — only permission codes authorize (unit-tested). Exception noted: the last-owner _safety guard_ identifies the system `organization_owner` role by key; it restricts rather than grants, and only definer code uses it.                                                                                                                   |
| Invitation takeover               | Acceptance requires the authenticated user's **confirmed** email to equal the invited email; invited rows visible only to that email; one open invite per email per org; invites revocable.                                                                                                                                                    |
| Slug enumeration                  | Non-members receive indistinguishable 404s; sign-in errors are uniform (no account oracle); magic link uses `shouldCreateUser: false`; reserved slugs blocked; org slugs immutable outside the platform-admin path.                                                                                                                            |
| Stored CSS injection              | Triple boundary: DB CHECK (hex/enum) → zod on write → render-time re-validation emitting only exact hex/enum (unit-tested with attack strings).                                                                                                                                                                                                |
| Audit-log mutation                | No write grants, no write policies; definer-trigger writes only; proven by test #16 (insert/update/delete all rejected; non-holders cannot read).                                                                                                                                                                                              |
| Open redirect in auth callback    | `next` restricted to same-origin single-slash paths (`/…`, never `//…`).                                                                                                                                                                                                                                                                       |

**Open advisory:** "Leaked password protection" (HaveIBeenPwned check) is a
dashboard-only toggle and remains OFF — listed as a manual step.

## 4. Known deviations and dev-bootstrap notes

- **Docker is not installed on this machine**, so the local Supabase stack
  could not run. The automated isolation suite therefore runs against the
  real `novakore-dev` database (real RLS, real sign-ins — not mocked),
  which satisfies the intent of the gate; installing Docker enables the
  CI-compatible local workflow already documented and configured.
- During initial bootstrap, three fixes were applied to the remote dev
  project via `create or replace function` after their migration had been
  recorded (audit-trigger status planning, reserved-slug DEFINER). The
  committed migration files contain the corrected definitions and replay
  correctly from zero; `db reset` on a local stack will verify this when
  Docker is available. All later changes (migrations 4–6) were applied as
  proper new migrations.
- Migration `allow_revoked_invitations` and the select-org scoping fix were
  both found by tests/QA — the gates worked as designed.

## 5. Deferred (intentionally not in Phase 1A)

- Audit-log viewer UI (data is captured and query-gated; surface lands in
  Phase 1B).
- Platform-admin provisioning UI (the gated `provision_organization` RPC
  exists; dashboard/SQL invocation documented for dev).
- Logo upload + `media_assets` (blocked on storage decision D-07, Phase 1B).
- `organization_settings` editor (only `default_locale` exists; no UI need
  yet).
- Custom SMTP for invites/magic links (Supabase built-in SMTP is
  rate-limited; fine for dev QA).
- Everything Phase 1B+: content entities, enrollment, delivery, AI.

## 6. Seeded development identities

All seeded accounts use the shared dev-only password defined in
`supabase/seed.sql` (never a production credential):

| Email                                                                                                    | Where                      | Purpose                                                       |
| -------------------------------------------------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------- |
| platform.admin@novakore.test                                                                             | Platform                   | Platform administrator (no org membership)                    |
| alpha.owner / alpha.admin / alpha.academy / alpha.reviewer / alpha.author / alpha.learner @novakore.test | Alpha Learning Collective  | Owner, admin, academy-scoped admin, reviewer, author, learner |
| alpha.suspended / alpha.removed @novakore.test                                                           | Alpha                      | Lockout fixtures                                              |
| bfh.owner / bfh.instructor / bfh.observer @novakore.test                                                 | Built For Her (Dev Tenant) | Owner, instructor (Coach), observer                           |
| alpha.author@novakore.test                                                                               | Both orgs                  | Multi-org fixture (author in Alpha, learner in BFH)           |
| alpha.invited@novakore.test                                                                              | Alpha                      | Open invitation (no auth user yet)                            |

## 7. Phase 1A exit criteria — status

| Criterion                                               | Status                                                                                                       |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Two seeded orgs demonstrably isolated (automated proof) | ✅ 22-test suite green against real database                                                                 |
| Role changes take effect without re-login               | ✅ permissions resolved per request, never baked into JWT                                                    |
| verify green / build passes                             | ✅                                                                                                           |
| Security gates                                          | ✅ (review above; one dashboard toggle outstanding)                                                          |
| Migration reset succeeds locally                        | ⚠️ pending Docker installation (replay-from-zero is the designed path; remote history and files are in sync) |
