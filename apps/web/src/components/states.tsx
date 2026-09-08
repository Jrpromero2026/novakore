import Link from "next/link";

/** Access-denied state: honest, calm, with a way back. */
export function AccessDenied({ backHref }: { backHref: string }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-center">
      <p className="text-caption font-medium uppercase tracking-[var(--tracking-caps)] text-text-muted">
        Access denied
      </p>
      <h1 className="text-h1 font-semibold tracking-tight text-text-primary">
        You don&apos;t have permission to view this
      </h1>
      <p className="max-w-md text-body-sm text-text-muted">
        Your roles in this organization don&apos;t include the required
        permission. If you think that&apos;s wrong, ask an organization
        administrator.
      </p>
      <Link
        href={backHref}
        className="nk-press mt-2 rounded-md border border-border-strong px-4 py-2 text-body-sm font-medium text-text-primary hover:bg-background-subtle"
      >
        Back to overview
      </Link>
    </div>
  );
}
