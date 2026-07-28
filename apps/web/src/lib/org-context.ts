import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import {
  can as canPure,
  effectiveOrgPermissions,
  type ActorGrants,
  type ResourceContext,
} from "@novakore/authorization";
import { isPermission, type Permission } from "@novakore/domain";
import { requireUser } from "./auth";
import { supabaseServer } from "./supabase/server";

export interface OrgContext {
  organization: {
    id: string;
    name: string;
    slug: string;
    status: string;
  };
  membershipId: string;
  grants: ActorGrants;
  /** Org-wide permissions, for rendering affordances only — never authorization. */
  orgPermissions: ReadonlySet<Permission>;
}

/**
 * Resolve the caller's organization context from the URL slug.
 *
 * Authorization chain (ADR-006): the database itself only returns the
 * organization when the caller holds an ACTIVE membership (RLS); grants are
 * then resolved from the caller's own assignments. Client-supplied slugs or
 * ids can never widen access because every underlying query is
 * membership-anchored at the database.
 */
export const getOrgContext = cache(
  async (orgSlug: string): Promise<OrgContext | null> => {
    const user = await requireUser();
    const supabase = await supabaseServer();

    const { data: org } = await supabase
      .from("organizations")
      .select("id, name, slug, status")
      .eq("slug", orgSlug)
      .maybeSingle();
    if (!org) return null;

    const { data: membership } = await supabase
      .from("organization_memberships")
      .select("id, status")
      .eq("organization_id", org.id)
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();
    if (!membership) return null;

    const { data: assignments } = await supabase
      .from("organization_member_roles")
      .select(
        "academy_id, organization_roles!inner(status, organization_role_permissions(permission_code))",
      )
      .eq("membership_id", membership.id);

    const grants: ActorGrants = {
      membershipStatus: "active",
      grants: (assignments ?? [])
        .filter((a) => a.organization_roles.status === "active")
        .map((a) => ({
          academyId: a.academy_id,
          permissions: a.organization_roles.organization_role_permissions
            .map((p) => p.permission_code)
            .filter(isPermission),
        })),
    };

    return {
      organization: org,
      membershipId: membership.id,
      grants,
      orgPermissions: effectiveOrgPermissions(grants),
    };
  },
);

/** Org context or 404 (slug unknown OR caller is not an active member — indistinguishable by design). */
export async function requireOrgContext(orgSlug: string): Promise<OrgContext> {
  const ctx = await getOrgContext(orgSlug);
  if (!ctx) notFound();
  return ctx;
}

/** Server-side permission check. Deny by default. */
export function can(
  ctx: OrgContext,
  permission: Permission,
  resource: ResourceContext = {},
) {
  return canPure(ctx.grants, permission, resource);
}

/** Guard for pages: renders the access-denied route when the check fails. */
export function requirePermission(
  ctx: OrgContext,
  permission: Permission,
  resource: ResourceContext = {},
): void {
  if (!can(ctx, permission, resource)) {
    redirect(`/${ctx.organization.slug}/admin/denied`);
  }
}
