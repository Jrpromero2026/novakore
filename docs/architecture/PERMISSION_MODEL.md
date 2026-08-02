# PERMISSION_MODEL

Deny by default, three enforced layers, one catalog (32 permissions in
`packages/domain/src/permissions.ts`).

1. **Database** — RLS policies + SECURITY DEFINER RPCs that re-check
   `app.has_org_permission(org, perm)` / `app.is_platform_admin()` inside
   the function body. The database is the final authority.
2. **Server** — `requireOrgContext` + `can(ctx, perm)` in layouts, pages,
   and server actions.
3. **Affordance** — `needsAny` filters nav/palette visibility; never
   authorization.

Rules: system roles are platform-managed bundles; custom roles compose
catalog permissions; BFH access levels map to role bundles and can never
mint permissions outside them; platform administrators are a separate,
self-visible table with no API writes. Adding a permission = catalog entry

- role bundles + RLS/RPC checks + authz tests — see
  phase-2-permission-matrix.md and tenancy-and-authorization.md.
