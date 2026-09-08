import { Skeleton } from "@/components/ui/feedback";

/**
 * Admin loading state. Deliberately NEUTRAL: this file is inherited by every
 * admin destination without its own boundary, so it sketches the shape they
 * all share (breadcrumb, title block, content panels) rather than mimicking
 * any one page — a dashboard-shaped skeleton here made all ~24 other pages
 * jump on arrival, the exact defect skeletons exist to prevent.
 */
export default function AdminLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading">
      <div className="space-y-3">
        <Skeleton className="h-3 w-44" />
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>

      <div className="rounded-xl border border-border-subtle bg-surface-elevated p-5">
        <Skeleton className="h-4 w-40" />
        <div className="mt-4 space-y-3">
          <Skeleton className="h-10 w-full rounded-lg" />
          <Skeleton className="h-10 w-full rounded-lg" />
          <Skeleton className="h-10 w-2/3 rounded-lg" />
        </div>
      </div>

      <div className="rounded-xl border border-border-subtle bg-surface-elevated p-5">
        <Skeleton className="h-4 w-32" />
        <div className="mt-4 space-y-3">
          <Skeleton className="h-10 w-full rounded-lg" />
          <Skeleton className="h-10 w-5/6 rounded-lg" />
        </div>
      </div>
    </div>
  );
}
