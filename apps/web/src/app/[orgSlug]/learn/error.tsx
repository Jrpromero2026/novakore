"use client"; // Error boundaries must be Client Components

import { useParams } from "next/navigation";
import { ErrorState } from "@/components/error-state";

/** Learner-shell boundary: keeps the Academy chrome and a way back. */
export default function LearnError({
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
      homeHref={`/${params.orgSlug}/learn`}
      homeLabel="Back to my learning"
    />
  );
}
