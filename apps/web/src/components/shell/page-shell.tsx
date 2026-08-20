import type { Crumb } from "@/lib/navigation/breadcrumbs";
import { Breadcrumbs } from "./breadcrumbs";

/**
 * The composition every domain page uses: breadcrumb, heading, optional rail.
 *
 * It exists so six domains cannot drift into six layouts. Each page supplies
 * its content; none of them decides where the trail sits or how wide the
 * column is.
 *
 * The rail is optional and collapses beneath the content on narrow screens
 * rather than disappearing — organization identity is exactly the thing that
 * must survive a small viewport, since "which workspace am I editing?" gets
 * harder to answer as the screen shrinks, not easier.
 */
export function PageShell({
  crumbs,
  title,
  description,
  actions,
  rail,
  children,
}: {
  crumbs: readonly Crumb[];
  title: string;
  description?: string;
  /** Primary actions for this level, aligned with the heading. */
  actions?: React.ReactNode;
  rail?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      className="mx-auto w-full px-4 py-8 sm:px-6 sm:py-10"
      style={{ maxWidth: "var(--layout-page-max)" }}
    >
      <Breadcrumbs crumbs={crumbs} />

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 max-w-2xl">
          <h1 className="text-h1 leading-tight tracking-tight text-text-primary">
            {title}
          </h1>
          {description ? (
            <p className="mt-2 text-body text-text-secondary">{description}</p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 items-center gap-2">{actions}</div>
        ) : null}
      </div>

      <div
        className={
          rail
            ? "mt-8 grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start"
            : "mt-8"
        }
      >
        <div className="min-w-0 space-y-5">{children}</div>
        {rail ? <div className="lg:sticky lg:top-24">{rail}</div> : null}
      </div>
    </div>
  );
}
