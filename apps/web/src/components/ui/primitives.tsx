import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

/** Minimal class join — no runtime dependency needed at this scale. */
export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const buttonStyles: Record<ButtonVariant, string> = {
  primary:
    "bg-accent text-accent-contrast hover:opacity-90 disabled:opacity-50 border border-transparent",
  secondary:
    "bg-surface text-text border border-border-strong hover:bg-surface-sunken disabled:opacity-50",
  ghost:
    "bg-transparent text-text-muted hover:text-text hover:bg-surface-sunken border border-transparent",
  danger:
    "bg-danger-soft text-danger border border-transparent hover:opacity-80 disabled:opacity-50",
};

export function Button({
  variant = "primary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      {...props}
      className={cx(
        "inline-flex items-center gap-2 rounded-md px-3.5 py-2 text-sm font-medium transition-colors duration-150",
        buttonStyles[variant],
        className,
      )}
    />
  );
}

export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cx(
        "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-text-faint",
        "focus:border-accent focus:outline-none",
        className,
      )}
    />
  );
}

export function Textarea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cx(
        "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-text-faint",
        "focus:border-accent focus:outline-none",
        className,
      )}
    />
  );
}

export function Select({
  className,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cx(
        "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text",
        "focus:border-accent focus:outline-none",
        className,
      )}
    />
  );
}

/** Labeled form field with error slot; label is always programmatically associated. */
export function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-text">
        {label}
      </label>
      {children}
      {hint && !error ? (
        <p className="text-xs text-text-faint">{hint}</p>
      ) : null}
      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function Card({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={cx(
        "rounded-lg border border-border bg-surface shadow-raised",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function CardHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
      <div>
        <h2 className="text-sm font-semibold tracking-tight text-text">
          {title}
        </h2>
        {description ? (
          <p className="mt-0.5 text-xs text-text-muted">{description}</p>
        ) : null}
      </div>
      {actions}
    </header>
  );
}

type BadgeTone = "neutral" | "accent" | "positive" | "warning" | "danger";

const badgeStyles: Record<BadgeTone, string> = {
  neutral: "bg-surface-sunken text-text-muted",
  accent: "bg-accent-soft text-accent",
  positive: "bg-positive/10 text-positive",
  warning: "bg-warning/10 text-warning",
  danger: "bg-danger-soft text-danger",
};

export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: BadgeTone;
  children: ReactNode;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
        badgeStyles[tone],
      )}
    >
      {children}
    </span>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      <p className="text-sm font-medium text-text">{title}</p>
      {description ? (
        <p className="max-w-sm text-sm text-text-muted">{description}</p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

/** Inline result banner for server-action outcomes. */
export function ActionBanner({
  state,
}: {
  state: { ok: boolean; message?: string; warnings?: string[] };
}) {
  if (!state.message && !state.warnings?.length) return null;
  return (
    <div className="space-y-1.5" aria-live="polite">
      {state.message ? (
        <p
          className={cx(
            "rounded-md px-3 py-2 text-sm",
            state.ok
              ? "bg-positive/10 text-positive"
              : "bg-danger-soft text-danger",
          )}
        >
          {state.message}
        </p>
      ) : null}
      {state.warnings?.map((w) => (
        <p
          key={w}
          className="rounded-md bg-warning/10 px-3 py-2 text-sm text-warning"
        >
          {w}
        </p>
      ))}
    </div>
  );
}
