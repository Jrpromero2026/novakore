import type { Permission } from "@novakore/domain";

/**
 * Pure permission resolution (tenancy-and-authorization.md §2, ADR-006).
 *
 * The database layer assembles an ActorGrants snapshot for one (user, org)
 * pair; this module answers permission questions about it. Pure and
 * synchronous so every rule is unit-testable. The SQL helpers
 * (app.has_org_permission / app.has_academy_permission) implement the same
 * semantics at the RLS layer — the isolation suite exercises both.
 */

export interface RoleGrant {
  /** Permission codes granted by one assigned, active role. */
  permissions: readonly Permission[];
  /** null = organization-wide assignment; otherwise scoped to this academy. */
  academyId: string | null;
}

export interface ActorGrants {
  /** Membership status in the organization under evaluation. */
  membershipStatus: "invited" | "active" | "suspended" | "removed";
  grants: readonly RoleGrant[];
}

export interface ResourceContext {
  /** When set, academy-scoped assignments to this academy also qualify. */
  academyId?: string;
}

/**
 * Deny-by-default permission check.
 *
 * - Only ACTIVE memberships hold any permission at all (suspended/removed/
 *   invited members lose tenant access immediately).
 * - Org-wide grants (academyId null) qualify everywhere in the org.
 * - Academy-scoped grants qualify only when the resource context names
 *   their academy.
 */
export function can(
  actor: ActorGrants,
  permission: Permission,
  context: ResourceContext = {},
): boolean {
  if (actor.membershipStatus !== "active") return false;

  for (const grant of actor.grants) {
    if (!grant.permissions.includes(permission)) continue;
    if (grant.academyId === null) return true;
    if (
      context.academyId !== undefined &&
      grant.academyId === context.academyId
    )
      return true;
  }
  return false;
}

/** All permissions the actor holds org-wide (for UI affordance rendering only). */
export function effectiveOrgPermissions(
  actor: ActorGrants,
): ReadonlySet<Permission> {
  if (actor.membershipStatus !== "active") return new Set();
  const set = new Set<Permission>();
  for (const grant of actor.grants) {
    if (grant.academyId !== null) continue;
    for (const p of grant.permissions) set.add(p);
  }
  return set;
}
