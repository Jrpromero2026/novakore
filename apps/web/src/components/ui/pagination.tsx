import Link from "next/link";
import type { PageMeta } from "@/lib/pagination";
import { pageHref } from "@/lib/pagination";
import { cx } from "./primitives";
import { IconChevronLeft, IconChevronRight } from "./icons";

/**
 * Collection pager (Experience Design System — collections).
 *
 * Server-safe and link-based: pages are real URLs, so they are shareable,
 * bookmarkable, and work without JavaScript. Always states the honest total
 * ("showing 26–50 of 83") — that count is what makes a truncated collection
 * visible instead of silently short.
 *
 * Renders nothing when everything already fits on one page: a pager for a
 * single page is chrome, not information.
 */
export function Pagination({
  meta,
  basePath,
  searchParams,
  param = "page",
  itemLabel = "items",
}: {
  meta: PageMeta;
  basePath: string;
  searchParams: Record<string, string | string[] | undefined>;
  /** Query key — give sibling collections on one page distinct keys. */
  param?: string;
  /** Plural noun for the summary line, e.g. "credentials". */
  itemLabel?: string;
}) {
  if (meta.pageCount <= 1) return null;

  const step =
    "nk-press inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-label font-medium";
  const enabled =
    "border-border-default text-text-secondary hover:border-border-strong hover:bg-surface-interactive hover:text-text-primary";
  const disabled = "border-border-subtle text-text-muted opacity-50";

  return (
    <nav
      aria-label={`${itemLabel} pagination`}
      className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle px-4 py-3"
    >
      <p className="text-caption tabular-nums text-text-muted">
        Showing <span className="text-text-secondary">{meta.showingFrom}</span>–
        <span className="text-text-secondary">{meta.showingTo}</span> of{" "}
        <span className="font-medium text-text-primary">{meta.total}</span>{" "}
        {itemLabel}
      </p>

      <div className="flex items-center gap-2">
        <span className="text-caption tabular-nums text-text-muted">
          Page {meta.page} of {meta.pageCount}
        </span>
        {meta.hasPrev ? (
          <Link
            href={pageHref(basePath, searchParams, param, meta.page - 1)}
            rel="prev"
            className={cx(step, enabled)}
          >
            <IconChevronLeft size={13} />
            Previous
          </Link>
        ) : (
          <span aria-disabled className={cx(step, disabled)}>
            <IconChevronLeft size={13} />
            Previous
          </span>
        )}
        {meta.hasNext ? (
          <Link
            href={pageHref(basePath, searchParams, param, meta.page + 1)}
            rel="next"
            className={cx(step, enabled)}
          >
            Next
            <IconChevronRight size={13} />
          </Link>
        ) : (
          <span aria-disabled className={cx(step, disabled)}>
            Next
            <IconChevronRight size={13} />
          </span>
        )}
      </div>
    </nav>
  );
}
