import { isViewOnlyPermission, type Permission } from "@novakore/domain";

/**
 * Request-time meaning of a non-active organization (suspended/archived):
 * members keep their READ access, every mutation is refused. This is the
 * pure decision; `org-context.can` applies it to permission checks and the
 * ownership-based server actions call `orgWriteBlockedMessage` directly.
 *
 * Deliberately still allowed while read-limited: feedback submission (the
 * runbook's incident-detection path) and accepting an invitation (joining
 * yields read-limited access, never write access).
 */
export function permissionAllowedUnderOrgStatus(
  orgStatus: string,
  permission: Permission,
): boolean {
  return orgStatus === "active" || isViewOnlyPermission(permission);
}

/** Non-null exactly when tenant-data writes must be refused. */
export function orgWriteBlockedMessage(orgStatus: string): string | null {
  if (orgStatus === "active") return null;
  return "This workspace is suspended and read-limited — changes are disabled until it is reactivated.";
}
