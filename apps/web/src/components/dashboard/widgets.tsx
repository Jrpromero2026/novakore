/**
 * Reusable workspace dashboard widgets.
 *
 * Server-safe presentational components. Every number rendered here comes
 * from a real query — widgets never fabricate metrics or trends. Token
 * driven, so they sit correctly under any tenant theme.
 */
import Link from "next/link";
import type { ComponentType, ReactNode } from "react";
import { cx } from "@/components/ui/primitives";
import { IconArrowRight, type IconProps } from "@/components/ui/icons";

/**
 * Compact metric signal. `context` carries composition or status — never a
 * fabricated period-over-period delta.
 */
export function Metric({
  label,
  value,
  context,
  href,
  emphasis = false,
}: {
  label: string;
  value: string | number;
  context?: ReactNode;
  href?: string;
  emphasis?: boolean;
}) {
  const body = (
    <>
      <p className="text-caption font-medium uppercase tracking-[var(--tracking-caps)] text-text-muted">
        {label}
      </p>
      <p
        className={cx(
          "mt-1.5 font-semibold leading-none tracking-tight tabular-nums",
          emphasis
            ? "text-[2rem] text-text-primary"
            : "text-[1.5rem] text-text-primary",
        )}
      >
        {value}
      </p>
      {context ? (
        <div className="mt-1.5 text-caption text-text-muted">{context}</div>
      ) : null}
    </>
  );

  const base =
    "block rounded-lg px-3.5 py-3 transition-colors duration-[var(--motion-fast)]";

  return href ? (
    <Link href={href} className={cx(base, "hover:bg-surface-interactive")}>
      {body}
    </Link>
  ) : (
    <div className={base}>{body}</div>
  );
}

/** Row list used for activity, drafts, and review queues. */
export function ListRows({
  rows,
  emptyLabel,
}: {
  rows: {
    key: string;
    title: ReactNode;
    meta?: ReactNode;
    badge?: ReactNode;
    href?: string;
  }[];
  emptyLabel: string;
}) {
  if (rows.length === 0) {
    return (
      <p className="px-3.5 pb-4 pt-1 text-body-sm text-text-muted">
        {emptyLabel}
      </p>
    );
  }
  return (
    <ul className="px-1.5 pb-2 pt-0.5">
      {rows.map((row) => {
        const inner = (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-body-sm text-text-primary">
                {row.title}
              </span>
              {row.meta ? (
                <span className="block truncate text-caption text-text-muted">
                  {row.meta}
                </span>
              ) : null}
            </span>
            {row.badge}
          </>
        );
        const rowClass =
          "flex items-center gap-3 rounded-md px-2 py-1.5 transition-colors duration-[var(--motion-fast)]";
        return (
          <li key={row.key}>
            {row.href ? (
              <Link
                href={row.href}
                className={cx(rowClass, "hover:bg-surface-interactive")}
              >
                {inner}
              </Link>
            ) : (
              <div className={rowClass}>{inner}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Creation surface. The lead action is emphasized; the rest are compact
 * rows — deliberately not eight identical rectangles.
 */
export function CreateActions({
  actions,
}: {
  actions: {
    href: string;
    label: string;
    description: string;
    icon: ComponentType<IconProps>;
  }[];
}) {
  if (actions.length === 0) return null;
  const [lead, ...rest] = actions;
  if (!lead) return null;

  return (
    <div className="grid gap-2.5 md:grid-cols-3">
      <Link
        href={lead.href}
        className="group flex flex-col justify-between rounded-lg bg-accent-soft p-4 transition-colors duration-[var(--motion-fast)] hover:bg-accent-soft md:row-span-2"
      >
        <lead.icon size={20} className="text-accent" />
        <span className="mt-6">
          <span className="block text-body font-medium text-text-primary">
            {lead.label}
          </span>
          <span className="mt-0.5 block text-caption text-text-secondary">
            {lead.description}
          </span>
        </span>
      </Link>
      <div className="grid gap-2.5 sm:grid-cols-2 md:col-span-2">
        {rest.map((action) => (
          <Link
            key={action.href + action.label}
            href={action.href}
            className="group flex items-start gap-2.5 rounded-lg border border-border-subtle px-3.5 py-3 transition-colors duration-[var(--motion-fast)] hover:border-border-strong hover:bg-surface-interactive"
          >
            <action.icon
              size={15}
              className="mt-0.5 shrink-0 text-text-muted transition-colors duration-[var(--motion-fast)] group-hover:text-accent"
            />
            <span className="min-w-0">
              <span className="block truncate text-body-sm font-medium text-text-primary">
                {action.label}
              </span>
              <span className="block truncate text-caption text-text-muted">
                {action.description}
              </span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

/** Trailing "view all" affordance for section headers. */
export function ViewAll({
  href,
  children = "View all",
}: {
  href: string;
  children?: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-1 text-label text-text-muted transition-colors duration-[var(--motion-fast)] hover:text-accent"
    >
      {children}
      <IconArrowRight size={12} />
    </Link>
  );
}
