"use client";

import { usePathname } from "next/navigation";
import { buildBreadcrumbs, type Crumb } from "@/lib/navigation/breadcrumbs";
import { Breadcrumbs } from "./breadcrumbs";
import { useDomains } from "./domains-context";

/**
 * The trail for wherever the page happens to be.
 *
 * A page cannot read its own pathname on the server, and passing one down
 * from every route would put the hierarchy back in twenty hand-maintained
 * places. So this reads the route on the client and derives the trail from
 * the shared domain model.
 *
 * `trail` carries the leaves only the page knows — a course's title, a
 * member's name. The shell supplies the spine; the page supplies the tip.
 */
export function AutoBreadcrumbs({ trail }: { trail?: readonly Crumb[] }) {
  const domains = useDomains();
  const pathname = usePathname() ?? "";
  if (!domains) return null;

  const crumbs = buildBreadcrumbs(domains, pathname, trail);
  // One crumb is the page's own name with nothing above it — a trail that
  // says only "you are here" is noise, not orientation.
  if (crumbs.length < 2) return null;

  return <Breadcrumbs crumbs={crumbs} />;
}
