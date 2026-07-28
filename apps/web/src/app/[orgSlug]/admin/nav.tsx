"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui/primitives";

interface NavItem {
  href: string;
  label: string;
  /** Affordance filter only — the server enforces authorization. */
  needsAny?: string[];
}

export function AdminNav({
  orgSlug,
  permissions,
}: {
  orgSlug: string;
  permissions: string[];
}) {
  const pathname = usePathname();
  const base = `/${orgSlug}/admin`;
  const held = new Set(permissions);

  const items: NavItem[] = [
    { href: base, label: "Overview" },
    {
      href: `${base}/members`,
      label: "Members",
      needsAny: ["org.members.manage"],
    },
    {
      href: `${base}/roles`,
      label: "Roles & permissions",
      needsAny: ["org.roles.manage"],
    },
    { href: `${base}/academies`, label: "Academies" },
    {
      href: `${base}/terminology`,
      label: "Terminology",
      needsAny: ["org.terminology.manage"],
    },
    {
      href: `${base}/branding`,
      label: "Branding",
      needsAny: ["org.branding.manage"],
    },
  ];

  return (
    <nav
      aria-label="Organization administration"
      className="md:w-52 md:shrink-0"
    >
      <ul className="flex flex-wrap gap-1 md:flex-col">
        {items
          .filter(
            (item) => !item.needsAny || item.needsAny.some((p) => held.has(p)),
          )
          .map((item) => {
            const active =
              item.href === base
                ? pathname === base
                : pathname.startsWith(item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cx(
                    "block rounded-md px-3 py-2 text-sm transition-colors",
                    active
                      ? "bg-accent-soft font-medium text-accent"
                      : "text-text-muted hover:bg-surface-sunken hover:text-text",
                  )}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
      </ul>
    </nav>
  );
}
