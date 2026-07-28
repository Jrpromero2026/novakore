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
  "assessment.grade",
  "enrollment.manage",
  "enrollment.self",
  "progress.view.own",
  "progress.view.others",
  "certificates.manage",
  "analytics.view",
  "audit.view",
  "integrations.manage",
  "ai.author.use",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export function isPermission(value: string): value is Permission {
  return (PERMISSIONS as readonly string[]).includes(value);
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
