/**
 * Workspace layout primitives (Platform Experience Transformation).
 *
 * Shared, deliberate variants — page headers, section headers, panels, and
 * toolbars — so every organization-admin interior expresses one system
 * instead of per-page one-off classes. Server-safe and token-driven, so a
 * tenant accent personalizes them without touching structure.
 */
import Link from "next/link";
import type { ReactNode } from "react";
import { AutoBreadcrumbs } from "@/components/shell/auto-breadcrumbs";
import type { Crumb } from "@/lib/navigation/breadcrumbs";
import { cx } from "./primitives";

/**
 * Standard page opening: trail, title, supporting line, actions.
 * Every priority admin interior uses this so headers stop drifting.
 */
/**
 * The heading block every admin page shares.
 *
 * The trail above the title is DERIVED from the route, not passed in. It
 * replaced an `eyebrow` string each page wrote by hand, which had already
 * drifted: Courses announced "Knowledge" while living in Learning, and
 * Members announced "Organization" after moving to People. A hierarchy
 * maintained in twenty places is a hierarchy that disagrees with itself.
 *
 * Pages that sit below a destination pass `trail` for the part only they
 * know — a course's title, a member's name.
 */
export function PageHeader({
  title,
  description,
  actions,
  className,
  trail,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
  trail?: readonly Crumb[];
}) {
  return (
    <header className={cx("min-w-0", className)}>
      <AutoBreadcrumbs trail={trail} />
      <div className="mt-3 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-text-primary">
            {title}
          </h1>
          {description ? (
            <p className="mt-1.5 max-w-2xl text-body-sm leading-relaxed text-text-secondary">
              {description}
            </p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {actions}
          </div>
        ) : null}
      </div>
    </header>
  );
}

/** In-page section divider with optional count and trailing action. */
export function SectionHeader({
  title,
  count,
  description,
  action,
  className,
}: {
  title: string;
  count?: number;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "flex flex-wrap items-center justify-between gap-3",
        className,
      )}
    >
      <div className="min-w-0">
        <h2 className="flex items-baseline gap-2 text-title text-text-primary">
          {title}
          {typeof count === "number" ? (
            <span className="text-label font-normal tabular-nums text-text-muted">
              {count}
            </span>
          ) : null}
        </h2>
        {description ? (
          <p className="mt-0.5 text-caption text-text-muted">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

/**
 * Surface tiers. `plain` leans on tone and spacing rather than a border —
 * the workspace should not outline every object (ui-principles.md). `hero` is
 * the one dominant surface per page: elevated + top lighting hairline +
 * restrained tenant-accent wash (experience-design-system.md). `interactive`
 * opts any panel into the hover-lift affordance.
 */
type PanelTone = "plain" | "outlined" | "elevated" | "hero";

const panelTones: Record<PanelTone, string> = {
  plain: "bg-surface",
  outlined: "border border-border-subtle bg-surface",
  elevated: "border border-border-subtle bg-surface-elevated shadow-raised",
  hero: "nk-hairline nk-wash border border-border-subtle bg-surface-elevated shadow-raised",
};

export function Panel({
  tone = "outlined",
  interactive = false,
  className,
  children,
}: {
  tone?: PanelTone;
  interactive?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={cx(
        "rounded-lg",
        panelTones[tone],
        interactive && "nk-card",
        className,
      )}
    >
      {children}
    </section>
  );
}

/** Filter/search strip that sits above a collection. */
export function Toolbar({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "flex flex-wrap items-center gap-2 rounded-lg bg-background-subtle px-2.5 py-2",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * Interactive collection row — the lighter replacement for table rows in
 * list surfaces. Renders as a link when `href` is supplied.
 */
export function DataRow({
  href,
  leading,
  title,
  meta,
  trailing,
  className,
}: {
  href?: string;
  leading?: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
  trailing?: ReactNode;
  className?: string;
}) {
  const inner = (
    <>
      {leading ? <span className="shrink-0">{leading}</span> : null}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-body-sm font-medium text-text-primary">
          {title}
        </span>
        {meta ? (
          <span className="mt-0.5 block truncate text-caption text-text-muted">
            {meta}
          </span>
        ) : null}
      </span>
      {trailing ? (
        <span className="flex shrink-0 items-center gap-2">{trailing}</span>
      ) : null}
    </>
  );

  const base =
    "flex items-center gap-3 rounded-md px-3 py-2.5 transition-colors duration-[var(--motion-fast)]";

  return href ? (
    <Link
      href={href}
      className={cx(base, "hover:bg-surface-interactive", className)}
    >
      {inner}
    </Link>
  ) : (
    <div className={cx(base, className)}>{inner}</div>
  );
}

/** Non-color-dependent status marker: dot + text label. */
export function StatusDot({
  tone,
  label,
}: {
  tone: "positive" | "accent" | "warning" | "danger" | "neutral";
  label: string;
}) {
  const dot: Record<typeof tone, string> = {
    positive: "bg-success",
    accent: "bg-accent",
    warning: "bg-warning",
    danger: "bg-danger",
    neutral: "bg-text-muted",
  };
  return (
    <span className="inline-flex items-center gap-1.5 text-caption text-text-secondary">
      <span aria-hidden className={cx("h-1.5 w-1.5 rounded-full", dot[tone])} />
      {label}
    </span>
  );
}
