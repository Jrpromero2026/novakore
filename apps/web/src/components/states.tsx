import Link from "next/link";
import type { ReactNode } from "react";
import { PlatformMark } from "./brand";

/** Access-denied state: honest, calm, with a way back. */
export function AccessDenied({ backHref }: { backHref: string }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-center">
      <p className="text-xs font-medium uppercase tracking-widest text-text-faint">
        Access denied
      </p>
      <h1 className="text-xl font-semibold tracking-tight text-text">
        You don&apos;t have permission to view this
      </h1>
      <p className="max-w-md text-sm text-text-muted">
        Your roles in this organization don&apos;t include the required
        permission. If you think that&apos;s wrong, ask an organization
        administrator.
      </p>
      <Link
        href={backHref}
        className="mt-2 rounded-md border border-border-strong px-4 py-2 text-sm font-medium text-text hover:bg-surface-sunken"
      >
        Back to overview
      </Link>
    </div>
  );
}

/** No-organization state for authenticated users without memberships. */
export function NoOrganization({
  email,
  signOut,
}: {
  email: string | null;
  signOut: ReactNode;
}) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
      <PlatformMark />
      <h1 className="text-h2 text-text-primary">No organization yet</h1>
      <p className="max-w-md text-sm text-text-muted">
        {email ? (
          <>
            <span className="font-medium text-text">{email}</span> isn&apos;t a
            member of any organization.
          </>
        ) : (
          "This account isn't a member of any organization."
        )}{" "}
        Organizations are created by the NovaKore platform team and joined by
        invitation — ask your organization&apos;s administrator to invite you,
        then sign in again.
      </p>
      <div className="mt-2">{signOut}</div>
    </div>
  );
}
