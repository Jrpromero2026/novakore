"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { domainTourId } from "@/lib/navigation/domain-tour-id";
import { tourTarget } from "@/lib/onboarding/targets";
import { usePathname } from "next/navigation";
import type { Domain } from "@/lib/navigation/domains";
import { cx } from "@/components/ui/primitives";

/**
 * The thin global bar: organization on the left, domains across the middle,
 * controls on the right. Hovering (or keyboard-focusing into) a domain
 * reveals a droplist of its secondary destinations, so any page in the
 * workspace is one hover + one click away; the domain word itself still
 * navigates to the domain overview.
 *
 * The active domain is derived from the current path rather than passed in,
 * so it stays correct when a user lands on a deep route directly from a
 * bookmark or an SSO deep link — the case a prop would silently get wrong.
 *
 * Domain resolution is longest-match, mirroring `domainForPath`. It is
 * duplicated here rather than imported because this is a Client Component
 * and the model is already serialised into props; importing the resolver
 * would pull the whole domain module into the browser bundle for one loop.
 *
 * The droplist is React state (mouse enter/leave + focus/blur), not a CSS
 * :hover variant: state closes the menu on route change and Escape, keeps
 * keyboard and pointer behavior identical, and is directly testable.
 */

function DomainMenuItem({
  domain,
  active,
  pathname,
}: {
  domain: Domain;
  active: boolean;
  pathname: string;
}) {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasMenu = domain.sections.length > 0;

  const show = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpen(true);
  };
  // A short grace period so the pointer can cross the gap into the panel.
  const hide = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), 120);
  };

  return (
    <li
      className="relative"
      onMouseEnter={hasMenu ? show : undefined}
      onMouseLeave={hasMenu ? hide : undefined}
      onFocus={hasMenu ? show : undefined}
      onBlur={hasMenu ? hide : undefined}
      onKeyDown={(event) => {
        if (event.key === "Escape") setOpen(false);
      }}
    >
      <Link
        href={domain.href}
        {...tourTarget(domainTourId(domain.key))}
        aria-current={active ? "page" : undefined}
        aria-expanded={hasMenu ? open : undefined}
        onClick={() => setOpen(false)}
        className={cx(
          "relative flex items-center gap-1 rounded-md px-3 text-body-sm font-medium transition-colors",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
          active
            ? "text-text-primary"
            : "text-text-secondary hover:text-text-primary",
        )}
        style={{ height: "calc(var(--layout-header) - 1px)" }}
      >
        {domain.label}
        {hasMenu ? (
          <span
            aria-hidden="true"
            className={cx(
              "text-[9px] text-text-muted transition-transform duration-[var(--motion-fast)]",
              open ? "rotate-180" : "",
            )}
          >
            ▾
          </span>
        ) : null}
        {active ? (
          <span
            aria-hidden="true"
            className="absolute inset-x-2 bottom-0 h-0.5 rounded-t bg-accent"
          />
        ) : null}
      </Link>

      {hasMenu && open ? (
        <div className="absolute left-1/2 top-full z-10 w-60 -translate-x-1/2 pt-1.5">
          <div className="nk-fade-up max-h-[70dvh] overflow-y-auto rounded-lg border border-border-default bg-surface p-2 shadow-lg">
            {domain.sections.map((section) => (
              <div key={section.label} className="pb-1 pt-1.5 first:pt-0.5">
                <p
                  className="px-2.5 pb-1 text-caption font-medium uppercase text-text-muted"
                  style={{ letterSpacing: "var(--tracking-caps)" }}
                >
                  {section.label}
                </p>
                <ul>
                  {section.items.map((item) => {
                    const itemActive =
                      pathname === item.href ||
                      pathname.startsWith(`${item.href}/`);
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          title={item.description}
                          aria-current={itemActive ? "page" : undefined}
                          onClick={() => setOpen(false)}
                          className={cx(
                            "block truncate rounded-md px-2.5 py-1.5 text-body-sm transition-colors",
                            itemActive
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
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </li>
  );
}
export function GlobalNav({
  domains,
  organizationName,
  children,
}: {
  domains: readonly Domain[];
  organizationName: string;
  /** Search trigger, notifications, theme, user menu — supplied by the shell. */
  children?: React.ReactNode;
}) {
  const pathname = usePathname() ?? "";

  let activeKey: string | null = null;
  let bestLength = -1;
  for (const domain of domains) {
    const candidates = [
      domain.href,
      ...domain.sections.flatMap((s) => s.items.map((i) => i.href)),
    ];
    for (const href of candidates) {
      if (pathname !== href && !pathname.startsWith(`${href}/`)) continue;
      if (href.length > bestLength) {
        bestLength = href.length;
        activeKey = domain.key;
      }
    }
  }

  return (
    <header
      className="sticky top-0 border-b border-border-subtle bg-background/85 backdrop-blur-md"
      style={{ zIndex: "var(--z-nav)" }}
    >
      <div
        className="mx-auto flex w-full items-center gap-4 px-4 sm:px-6"
        style={{
          height: "var(--layout-header)",
          maxWidth: "var(--layout-page-max)",
        }}
      >
        <Link
          href={domains[0]?.href ?? "/"}
          className="flex min-w-0 shrink items-center gap-2.5 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <span
            aria-hidden="true"
            className="grid size-7 shrink-0 place-items-center rounded-md bg-text text-[11px] font-bold text-background"
          >
            {organizationName.slice(0, 1).toUpperCase()}
          </span>
          <span className="truncate text-body font-semibold text-text">
            {organizationName}
          </span>
        </Link>

        <nav
          aria-label="Workspace domains"
          className="hidden min-w-0 flex-1 justify-center lg:flex"
        >
          <ul className="flex items-center gap-0.5">
            {domains.map((domain) => (
              <DomainMenuItem
                key={domain.key}
                domain={domain}
                active={domain.key === activeKey}
                pathname={pathname}
              />
            ))}
          </ul>
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-2 lg:ml-0">
          {children}
        </div>
      </div>

      {/*
        Below the large breakpoint the domains move to their own scrollable
        row rather than collapsing into a drawer. A drawer would recreate the
        list-of-everything the redesign exists to remove; six horizontally
        scrolling words stay honest to the model.
      */}
      <nav
        aria-label="Workspace domains"
        className="border-t border-border-subtle lg:hidden"
      >
        <ul className="flex items-center gap-0.5 overflow-x-auto px-3 py-1.5">
          {domains.map((domain) => {
            const active = domain.key === activeKey;
            return (
              <li key={domain.key} className="shrink-0">
                <Link
                  href={domain.href}
                  {...tourTarget(domainTourId(domain.key))}
                  aria-current={active ? "page" : undefined}
                  className={cx(
                    "block rounded-md px-3 py-1.5 text-body-sm font-medium",
                    active
                      ? "bg-accent-soft text-text-primary"
                      : "text-text-secondary hover:text-text-primary",
                  )}
                >
                  {domain.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </header>
  );
}
