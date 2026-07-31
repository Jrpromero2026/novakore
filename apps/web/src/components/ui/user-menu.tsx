"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { cx } from "./primitives";
import { IconSignOut, IconSwitch } from "./icons";

/**
 * Session menu: viewer identity, organization switching, sign out.
 * Menu-button pattern — Escape closes, outside click closes, focus returns
 * to the trigger. Sign-out remains a real form post to the server action.
 */
export function UserMenu({
  email,
  signOutAction,
}: {
  email: string | null;
  signOutAction: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const initial = (email?.trim()?.[0] ?? "?").toUpperCase();

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        onClick={() => setOpen((prev) => !prev)}
        className={cx(
          "flex h-7 w-7 items-center justify-center rounded-full border text-caption font-semibold uppercase transition-colors duration-[var(--motion-fast)]",
          open
            ? "border-accent bg-accent-soft text-accent"
            : "border-border-default text-text-secondary hover:border-border-strong hover:text-text-primary",
        )}
      >
        {initial}
      </button>

      {open ? (
        <div
          role="menu"
          aria-label="Account"
          className="nk-fade-up absolute right-0 top-[calc(100%+0.5rem)] w-56 overflow-hidden rounded-lg border border-border-default bg-background-elevated shadow-overlay"
          style={{ zIndex: "var(--z-panel)" }}
        >
          <div className="border-b border-border-subtle px-3 py-2.5">
            <p className="text-caption text-text-muted">Signed in as</p>
            <p className="truncate text-body-sm text-text-primary">
              {email ?? "Unknown account"}
            </p>
          </div>
          <div className="p-1">
            <Link
              role="menuitem"
              href="/select-org"
              className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-body-sm text-text-secondary transition-colors duration-[var(--motion-fast)] hover:bg-surface-interactive hover:text-text-primary"
            >
              <IconSwitch size={15} className="text-text-muted" />
              Switch organization
            </Link>
            <form action={signOutAction}>
              <button
                role="menuitem"
                type="submit"
                className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-body-sm text-text-secondary transition-colors duration-[var(--motion-fast)] hover:bg-surface-interactive hover:text-text-primary"
              >
                <IconSignOut size={15} className="text-text-muted" />
                Sign out
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
