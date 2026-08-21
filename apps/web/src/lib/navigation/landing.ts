import { buildDomains } from "./domains";

/**
 * Where a member belongs when they arrive at an organization.
 *
 * Everyone was sent to /admin regardless of role, so a learner signing in
 * met the administration workspace: one navigation item, an empty dashboard,
 * and no sign that their courses were somewhere else entirely.
 *
 * The answer is derived from the SAME domain model the navigation uses
 * rather than from a list of role names. A role is a bundle of permissions
 * that an organization can redefine — "learner" is not a fixed thing — so
 * asking "does this person's permission set open anything in the admin
 * workspace?" stays correct when roles change and when new destinations are
 * added. If every domain is empty for them, the admin workspace has nothing
 * to offer and the learner shell is where they were going all along.
 *
 * Note this is a ROUTING decision, not an authorization one: every admin
 * route still guards itself server-side (ADR-006). Sending someone to /learn
 * grants them nothing, and sending them to /admin would grant them nothing
 * either — it would just waste their time.
 */
export function landingPathFor(
  orgSlug: string,
  permissions: readonly string[],
): string {
  const domains = buildDomains(orgSlug, permissions);
  // Home is always visible and carries no sections, so it never counts as a
  // reason to send someone here.
  const hasAdminSurface = domains.some((d) => d.sections.length > 0);
  return hasAdminSurface ? `/${orgSlug}/admin` : `/${orgSlug}/learn`;
}
