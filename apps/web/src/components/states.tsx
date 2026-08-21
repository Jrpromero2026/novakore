import Link from "next/link";

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
        className="nk-press mt-2 rounded-md border border-border-strong px-4 py-2 text-sm font-medium text-text hover:bg-surface-sunken"
      >
        Back to overview
      </Link>
    </div>
  );
}

/** No-organization state for authenticated users without memberships. */
