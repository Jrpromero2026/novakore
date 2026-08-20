"use client";

import { usePathname } from "next/navigation";
import { buildBreadcrumbs } from "@/lib/navigation/breadcrumbs";
import { allDestinations, type Domain } from "@/lib/navigation/domains";
import { Breadcrumbs } from "./breadcrumbs";

/**
 * Breadcrumb and heading derived from the current route.
 *
 * Exists for layouts that wrap several destinations at once — Studio wraps
 * six. Those pages previously shared one hard-coded "Learning Studio"
 * heading supplied by their layout, which is precisely the flattening the
 * redesign removes: Library and the review queue are different levels of the
 * organization, not tabs of one screen.
 *
 * A layout is a Server Component and never receives the pathname, so this
 * reads it on the client. The domain model arrives as a prop, already
 * permission-filtered on the server.
 */
export function AutoHeader({ domains }: { domains: readonly Domain[] }) {
  const pathname = usePathname() ?? "";
  const crumbs = buildBreadcrumbs(domains, pathname);

  // Longest match, so /studio/library is Library rather than Studio.
  let current: { label: string; description: string } | null = null;
  let best = -1;
  for (const item of allDestinations(domains)) {
    const matches =
      pathname === item.href || pathname.startsWith(`${item.href}/`);
    if (matches && item.href.length > best) {
      best = item.href.length;
      current = { label: item.label, description: item.description };
    }
  }

  if (!current) return null;

  return (
    <div className="mb-6">
      <Breadcrumbs crumbs={crumbs} />
      <h1 className="mt-4 text-h1 leading-tight tracking-tight text-text-primary">
        {current.label}
      </h1>
      <p className="mt-2 max-w-2xl text-body text-text-secondary">
        {current.description}
      </p>
    </div>
  );
}
