"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Domain } from "@/lib/navigation/domains";
import { cx } from "@/components/ui/primitives";

/**
 * The build rail: a persistent left sidebar listing every destination the
 * member can reach, ordered top-down through the content hierarchy —
 * structure first (journeys, then courses), then authoring, then people,
 * insight, and workspace configuration.
 *
 * It renders the SAME domain model as the top bar and the command palette
 * (one source of truth; `needsAny` filtering already happened in
 * buildDomains) — only the display order is its own, because a sidebar's job
 * is wayfinding down a hierarchy, not naming conceptual domains. Hidden
 * below `lg`, where the top bar's scrollable domain row keeps working.
 */

const SIDEBAR_DOMAIN_ORDER = [
  "learning",
  "knowledge",
  "people",
  "intelligence",
  "workspace",
] as const;

export function SideNav({ domains }: { domains: readonly Domain[] }) {
  const pathname = usePathname() ?? "";
  const home = domains.find((d) => d.key === "home");

  const ordered = SIDEBAR_DOMAIN_ORDER.map((key) =>
    domains.find((d) => d.key === key),
  ).filter((d): d is Domain => d !== undefined && d.sections.length > 0);

  // Longest-match active item across everything the rail shows.
  let activeHref: string | null = null;
  for (const domain of ordered) {
    for (const item of domain.sections.flatMap((s) => s.items)) {
      if (pathname !== item.href && !pathname.startsWith(`${item.href}/`))
        continue;
      if (activeHref === null || item.href.length > activeHref.length)
        activeHref = item.href;
    }
  }
  const dashboardActive = activeHref === null && pathname === home?.href;

  return (
    <nav
      aria-label="Workspace sections"
      className="hidden w-56 shrink-0 border-r border-border-subtle lg:block"
    >
      <div
        className="sticky overflow-y-auto py-5 pl-4 pr-3"
        style={{
          top: "var(--layout-header)",
          maxHeight: "calc(100dvh - var(--layout-header))",
        }}
      >
        {home ? (
          <Link
            href={home.href}
            aria-current={dashboardActive ? "page" : undefined}
            className={cx(
              "mb-4 flex items-center rounded-md px-2.5 py-1.5 text-body-sm font-medium transition-colors",
              dashboardActive
                ? "bg-accent-soft text-accent"
                : "text-text-secondary hover:bg-surface-interactive hover:text-text-primary",
            )}
          >
            Dashboard
          </Link>
        ) : null}

        <ul className="space-y-5">
          {ordered.map((domain) => (
            <li key={domain.key}>
              <p
                className="mb-1 px-2.5 text-caption font-medium uppercase text-text-muted"
                style={{ letterSpacing: "var(--tracking-caps)" }}
              >
                {domain.label}
              </p>
              <ul className="space-y-0.5">
                {domain.sections
                  .flatMap((section) => section.items)
                  .map((item) => {
                    const active = item.href === activeHref;
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          title={item.description}
                          aria-current={active ? "page" : undefined}
                          className={cx(
                            "block truncate rounded-md px-2.5 py-1.5 text-body-sm transition-colors",
                            active
                              ? "bg-accent-soft font-medium text-accent"
                              : "text-text-secondary hover:bg-surface-interactive hover:text-text-primary",
                          )}
                        >
                          {item.label}
                        </Link>
                      </li>
                    );
                  })}
              </ul>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}
