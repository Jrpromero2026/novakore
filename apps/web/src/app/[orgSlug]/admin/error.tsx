"use client"; // Error boundaries must be Client Components

import { useParams } from "next/navigation";
import { ErrorState } from "@/components/error-state";

/**
 * Admin-shell boundary: the global nav and org chrome (the layout above)
 * survive an error in any admin destination, so the user keeps a way out.
 */
export default function AdminError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  const params = useParams<{ orgSlug: string }>();
  return (
    <ErrorState
      error={error}
      retry={unstable_retry}
      homeHref={`/${params.orgSlug}/admin`}
      homeLabel="Back to overview"
    />
  );
}
