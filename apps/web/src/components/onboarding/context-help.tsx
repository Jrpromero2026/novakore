import type { ReactNode } from "react";
import { cx } from "@/components/ui/primitives";

/**
 * Contextual education (docs/architecture/onboarding.md §6): a compact,
 * expandable explanation that lets a page teach itself without leaving the
 * workflow. Native <details> keeps it server-renderable, keyboard
 * accessible, and dependency-free; closed by default so pages stay calm.
 */
export function ContextHelp({
  summary,
  children,
  className,
}: {
  /** One-line question or label, e.g. "What is a Journey?" */
  summary: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <details
      className={cx(
        "group rounded-md border border-border-subtle bg-surface px-3 py-2",
        className,
      )}
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 text-caption font-medium text-text-secondary transition-colors duration-[var(--motion-fast)] hover:text-text-primary [&::-webkit-details-marker]:hidden">
        <span
          aria-hidden
          className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[10px] font-semibold text-accent"
        >
          ?
        </span>
        {summary}
        <span
          aria-hidden
          className="ml-auto text-text-muted transition-transform duration-[var(--motion-fast)] group-open:rotate-90"
        >
          ›
        </span>
      </summary>
      <div className="nk-fade-up mt-2 border-t border-border-subtle pt-2 text-caption leading-relaxed text-text-secondary">
        {children}
      </div>
    </details>
  );
}
