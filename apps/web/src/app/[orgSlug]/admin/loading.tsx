import { Skeleton } from "@/components/ui/feedback";

/**
 * Admin loading state, shaped like the Executive Command Center so the real
 * page settles into place instead of jumping: hero, executive-metric grid,
 * intelligence panel, then the two-column body (experience-design-system.md —
 * skeletons match the final layout).
 */
export default function AdminLoading() {
  return (
    <div className="space-y-8" aria-busy="true" aria-label="Loading">
      {/* Hero */}
      <div className="rounded-xl border border-border-subtle bg-surface-elevated p-6 sm:p-7">
        <div className="grid gap-x-8 gap-y-6 lg:grid-cols-[1.35fr_1fr]">
          <div className="space-y-3">
            <Skeleton className="h-3.5 w-40" />
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-80 max-w-full" />
            <div className="flex gap-2 pt-2">
              <Skeleton className="h-9 w-28" />
              <Skeleton className="h-9 w-24" />
            </div>
          </div>
          <div className="space-y-3 border-t border-border-subtle pt-5 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-7 w-24" />
            <Skeleton className="h-2 w-full rounded-full" />
            <Skeleton className="h-3.5 w-48" />
          </div>
        </div>
      </div>

      {/* Executive metrics */}
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div
            key={i}
            className="rounded-xl border border-border-subtle bg-surface-elevated p-4"
          >
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-3 h-8 w-16" />
            <Skeleton className="mt-2 h-3 w-28" />
          </div>
        ))}
      </div>

      {/* Intelligence panel */}
      <div className="rounded-xl border border-border-subtle bg-surface-elevated">
        <div className="flex items-center gap-2.5 border-b border-border-subtle px-5 py-3.5">
          <Skeleton className="h-7 w-7 rounded-lg" />
          <div className="space-y-1.5">
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-3 w-48" />
          </div>
        </div>
        <div className="space-y-3 px-5 py-4">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </div>

      {/* Two-column body */}
      <div className="grid gap-x-6 gap-y-8 lg:grid-cols-2">
        <div className="space-y-3">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-16 w-full rounded-lg" />
          <Skeleton className="h-16 w-full rounded-lg" />
        </div>
        <div className="space-y-3">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-36 w-full rounded-lg" />
        </div>
      </div>
    </div>
  );
}
