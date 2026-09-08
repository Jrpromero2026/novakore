import { Skeleton } from "@/components/ui/feedback";

/**
 * Learner-shell loading state. Neutral for the same reason as the admin one:
 * it covers every /learn destination (home, journey map, course outline,
 * lesson) — a heading block plus content panels they all share.
 */
export default function LearnLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading">
      <div className="space-y-3">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>

      <div className="rounded-xl border border-border-subtle bg-surface-elevated p-5">
        <div className="space-y-3">
          <Skeleton className="h-12 w-full rounded-lg" />
          <Skeleton className="h-12 w-full rounded-lg" />
          <Skeleton className="h-12 w-3/4 rounded-lg" />
        </div>
      </div>
    </div>
  );
}
