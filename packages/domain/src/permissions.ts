/**
 * Platform permission catalog (tenancy-and-authorization.md §3).
 *
 * Platform-defined and finite: tenants bundle these into roles but can never
 * mint new codes. This list must stay in exact parity with the
 * public.permissions rows seeded by supabase/migrations — an architecture
 * test enforces the parity against the migration SQL.
 */
export const PERMISSIONS = [
  "org.manage",
  "org.members.manage",
  "org.roles.manage",
  "org.branding.manage",
  "org.branding.publish",
  "org.terminology.manage",
  "academy.manage",
  "content.view_draft",
  "content.author",
  "content.publish",
  "content.archive",
  "paths.manage",
  "assessment.author",
  "assessment.publish",
  "assessment.assign",
  "assessment.grade",
  "assessment.override",
  "enrollment.manage",
  "enrollment.self",
  "progress.view.own",
  "progress.view.others",
  "progress.override",
  "certificates.manage",
  "credential.issue",
  "credential.revoke",
  "library.manage",
  "sources.manage",
  "ai.budget.manage",
  "analytics.view",
  "audit.view",
  "integrations.manage",
  "ai.author.use",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export function isPermission(value: string): value is Permission {
  return (PERMISSIONS as readonly string[]).includes(value);
}

/**
 * Permissions that only READ tenant state. When an organization is not
 * `active` (suspended, archived), these are the only permissions that keep
 * working — the application layer (`can` in apps/web org-context) refuses
 * everything else, which is what makes a non-active organization
 * "read-limited" in practice. RLS stays membership-anchored and does NOT
 * gate on organization status; this list is the request-time contract.
 */
export const VIEW_ONLY_PERMISSIONS = [
  "content.view_draft",
  "progress.view.own",
  "progress.view.others",
  "analytics.view",
  "audit.view",
] as const satisfies readonly Permission[];

export function isViewOnlyPermission(value: Permission): boolean {
  return (VIEW_ONLY_PERMISSIONS as readonly Permission[]).includes(value);
}

/** System role keys seeded for every organization. */
export const SYSTEM_ROLE_KEYS = [
  "organization_owner",
  "organization_admin",
  "academy_admin",
  "author",
  "reviewer",
  "instructor",
  "manager",
  "learner",
  "observer",
] as const;

export type SystemRoleKey = (typeof SYSTEM_ROLE_KEYS)[number];
