/**
 * NovaKore platform identity components.
 *
 * PROVISIONAL MARK: the monogram below is a temporary geometric treatment,
 * clearly not a final trademarked logo (brand framework §6). Final vector
 * assets replace these components' internals via the platform asset slots
 * without changing any consumer.
 */
import { cx } from "./ui/primitives";

/** Typeset platform wordmark. Token-driven color; never tenant-recolored. */
export function NovaKoreWordmark({ className }: { className?: string }) {
  return (
    <span
      className={cx(
        "select-none font-sans font-semibold tracking-tight text-text",
        className,
      )}
      aria-label="NovaKore"
    >
      Nova<span className="text-accent">Kore</span>
    </span>
  );
}

/** Provisional geometric "N" monogram (labeled provisional by design docs). */
export function NovaKoreMonogram({
  size = 24,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role="img"
      aria-label="NovaKore provisional monogram"
      className={className}
    >
      <rect
        x="1"
        y="1"
        width="22"
        height="22"
        rx="5"
        className="fill-[var(--accent)]"
      />
      <path
        d="M7.5 17V7l9 10V7"
        fill="none"
        stroke="var(--accent-contrast)"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Standard platform header lockup for platform-identity surfaces. */
export function PlatformMark({ className }: { className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-2", className)}>
      <NovaKoreMonogram size={22} />
      <NovaKoreWordmark className="text-body" />
    </span>
  );
}
