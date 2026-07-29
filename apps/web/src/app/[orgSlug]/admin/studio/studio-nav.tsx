"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { cx } from "@/components/ui/primitives";

/**
 * Studio navigation + command palette foundation (Ctrl/Cmd-K). The
 * palette is command-driven creation and navigation over known routes —
 * no fake search index.
 */
export function StudioNav({ orgSlug }: { orgSlug: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const base = `/${orgSlug}/admin/studio`;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const items = useMemo(
    () => [
      { href: base, label: "Overview" },
      { href: `${base}/paths`, label: "Paths" },
      { href: `/${orgSlug}/admin/courses`, label: "Courses" },
      { href: `/${orgSlug}/admin/assessments`, label: "Assessments" },
      { href: `${base}/library`, label: "Library" },
      { href: `${base}/ai`, label: "AI Workspace" },
      { href: `${base}/review`, label: "Review" },
    ],
    [base, orgSlug],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((v) => !v);
        setQuery("");
      }
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const matches = items.filter((i) =>
    i.label.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <>
      <nav
        aria-label="Learning Studio"
        className="flex flex-wrap items-center gap-1"
      >
        {items.map((item) => {
          const active =
            item.href === base
              ? pathname === base
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cx(
                "rounded-md px-3 py-1.5 text-body-sm transition-colors",
                active
                  ? "bg-accent-soft font-medium text-accent"
                  : "text-text-muted hover:bg-surface-sunken hover:text-text-primary",
              )}
            >
              {item.label}
            </Link>
          );
        })}
        <button
          onClick={() => setOpen(true)}
          className="ml-auto rounded-md border border-border-default px-3 py-1.5 text-caption text-text-muted transition-colors hover:border-border-strong hover:text-text-primary"
          aria-haspopup="dialog"
        >
          Search · Ctrl K
        </button>
      </nav>

      {open ? (
        <div
          role="dialog"
          aria-label="Studio command palette"
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[15vh]"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-lg border border-border-default bg-surface shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && matches[0]) {
                  router.push(matches[0].href);
                  setOpen(false);
                }
              }}
              placeholder="Jump to…"
              aria-label="Search Studio"
              className="w-full border-b border-border-subtle bg-transparent px-4 py-3 text-body text-text-primary outline-none"
            />
            <ul className="max-h-64 overflow-y-auto py-1">
              {matches.map((item) => (
                <li key={item.href}>
                  <button
                    className="w-full px-4 py-2 text-left text-body-sm text-text-primary hover:bg-surface-interactive"
                    onClick={() => {
                      router.push(item.href);
                      setOpen(false);
                    }}
                  >
                    {item.label}
                  </button>
                </li>
              ))}
              {matches.length === 0 ? (
                <li className="px-4 py-2 text-body-sm text-text-muted">
                  No matches.
                </li>
              ) : null}
            </ul>
          </div>
        </div>
      ) : null}
    </>
  );
}
