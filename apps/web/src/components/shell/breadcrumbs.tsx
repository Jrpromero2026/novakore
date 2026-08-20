import Link from "next/link";
import type { Crumb } from "@/lib/navigation/breadcrumbs";

/**
 * The trail that replaces the sidebar as the answer to "where am I?".
 *
 * Rendered as an ordered list inside a labelled nav so assistive technology
 * reports position rather than four loose links. The current page is marked
 * `aria-current="page"` and is never a link — including when a page supplied
 * it, which `buildBreadcrumbs` already strips.
 */
export function Breadcrumbs({ crumbs }: { crumbs: readonly Crumb[] }) {
  if (crumbs.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-caption">
        {crumbs.map((crumb, i) => {
          const last = i === crumbs.length - 1;
          return (
            <li
              key={`${crumb.label}-${i}`}
              className="flex items-center gap-1.5"
            >
              {i > 0 ? (
                <span aria-hidden="true" className="text-text-muted/60">
                  /
                </span>
              ) : null}
              {crumb.href ? (
                <Link
                  href={crumb.href}
                  className="rounded-sm text-accent underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  {crumb.label}
                </Link>
              ) : (
                <span
                  className={last ? "text-text" : "text-text-muted"}
                  {...(last ? { "aria-current": "page" as const } : {})}
                >
                  {crumb.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
