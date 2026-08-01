"use client";

import { useState, type ReactNode } from "react";
import { Button, cx } from "./primitives";

type AlertTone = "info" | "success" | "warning" | "danger";

const alertStyles: Record<AlertTone, { box: string; label: string }> = {
  info: { box: "border-info/30 bg-info/8 text-text-primary", label: "Note" },
  success: {
    box: "border-success/30 bg-success/8 text-text-primary",
    label: "Success",
  },
  warning: {
    box: "border-warning/40 bg-warning/8 text-text-primary",
    label: "Warning",
  },
  danger: {
    box: "border-danger/40 bg-danger-soft text-text-primary",
    label: "Problem",
  },
};

/** Non-color status is carried by the leading label, not hue alone. */
export function Alert({
  tone,
  title,
  children,
}: {
  tone: AlertTone;
  title?: string;
  children: ReactNode;
}) {
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cx(
        "nk-fade-up rounded-md border px-3.5 py-2.5",
        alertStyles[tone].box,
      )}
    >
      <p className="text-body-sm">
        <span
          className={cx(
            "mr-2 font-semibold",
            tone === "danger" && "text-danger",
            tone === "warning" && "text-warning",
            tone === "success" && "text-success",
            tone === "info" && "text-info",
          )}
        >
          {title ?? alertStyles[tone].label}:
        </span>
        {children}
      </p>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cx("nk-shimmer rounded-md", className)} />;
}

/**
 * Destructive action with an explicit inline confirmation step — clear
 * language, no modal chain, keyboard-reachable, screen-reader announced.
 */
export function ConfirmButton({
  label,
  confirmLabel,
  description,
  disabled,
  onConfirm,
  className,
}: {
  label: string;
  confirmLabel: string;
  description: string;
  disabled?: boolean;
  onConfirm: () => void;
  className?: string;
}) {
  const [arming, setArming] = useState(false);

  if (!arming) {
    return (
      <Button
        variant="danger"
        disabled={disabled}
        className={className}
        onClick={() => setArming(true)}
      >
        {label}
      </Button>
    );
  }

  return (
    <span
      className="nk-fade-up inline-flex flex-wrap items-center gap-1.5"
      role="alertdialog"
      aria-label={description}
    >
      <span className="text-body-sm text-text-secondary">{description}</span>
      <Button
        variant="danger"
        disabled={disabled}
        className={className}
        onClick={() => {
          setArming(false);
          onConfirm();
        }}
      >
        {confirmLabel}
      </Button>
      <Button
        variant="ghost"
        className={className}
        onClick={() => setArming(false)}
      >
        Cancel
      </Button>
    </span>
  );
}
