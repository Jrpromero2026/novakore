"use client"; // Error boundaries must be Client Components

import { ErrorState } from "@/components/error-state";

/** Root segment boundary: anything outside the org shells lands here. */
export default function RootError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <ErrorState
        error={error}
        retry={unstable_retry}
        homeHref="/"
        homeLabel="Go to NovaKore home"
      />
    </main>
  );
}
