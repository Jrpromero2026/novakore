"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/primitives";

/**
 * Shared route-error fallback for segment error boundaries. Server-component
 * errors arrive with a generic message plus a digest for log correlation;
 * client errors carry their real message. `retry` re-fetches and re-renders
 * the failed segment (this Next fork's unstable_retry).
 */
export function ErrorState({
  error,
  retry,
  homeHref,
  homeLabel,
}: {
  error: Error & { digest?: string };
  retry: () => void;
  homeHref: string;
  homeLabel: string;
}) {
  useEffect(() => {
    // Until error tracking is wired (documented owner choice), the browser
    // console is the only client-side signal carrying the digest.
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-center">
      <p className="text-caption font-medium uppercase tracking-[var(--tracking-caps)] text-text-muted">
        Something went wrong
      </p>
      <h1 className="text-h1 font-semibold tracking-tight text-text-primary">
        This page hit an unexpected error
      </h1>
      <p className="max-w-md text-body-sm text-text-muted">
        The rest of the workspace is unaffected. Retry usually clears a
        temporary failure; if it keeps happening, share the reference code below
        with support.
      </p>
      {error.digest ? (
        <p className="font-mono text-caption text-text-muted">
          Reference: {error.digest}
        </p>
      ) : null}
      <div className="mt-2 flex items-center gap-2">
        <Button type="button" onClick={() => retry()}>
          Try again
        </Button>
        <Link
          href={homeHref}
          className="nk-press inline-flex items-center rounded-md border border-border-default px-3.5 py-2 text-sm font-medium text-text-primary hover:bg-surface-interactive"
        >
          {homeLabel}
        </Link>
      </div>
    </div>
  );
}
