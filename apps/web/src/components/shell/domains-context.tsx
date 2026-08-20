"use client";

import { createContext, useContext } from "react";
import type { Domain } from "@/lib/navigation/domains";

/**
 * The permission-filtered domain model, shared with client components.
 *
 * Breadcrumbs must be derived from the SAME model the navigation uses, or
 * the trail starts describing a hierarchy the product does not have — which
 * is exactly what the hand-written `eyebrow` strings had already drifted
 * into (Courses claimed "Knowledge" while living in Learning).
 *
 * Filtering happens once, on the server, in the layout. Nothing here is a
 * security boundary: every route authorizes itself (ADR-006). This exists so
 * a page deep in the tree can render its own trail without re-deriving who
 * the caller is.
 */
const DomainsContext = createContext<readonly Domain[] | null>(null);

export function DomainsProvider({
  domains,
  children,
}: {
  domains: readonly Domain[];
  children: React.ReactNode;
}) {
  return (
    <DomainsContext.Provider value={domains}>
      {children}
    </DomainsContext.Provider>
  );
}

/**
 * Null outside the admin shell rather than throwing: shared UI components
 * render in places the provider does not reach, and a missing trail is a
 * degradation, not a fault.
 */
export function useDomains(): readonly Domain[] | null {
  return useContext(DomainsContext);
}
