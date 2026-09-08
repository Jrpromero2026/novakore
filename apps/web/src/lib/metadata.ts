import "server-only";
import type { Metadata } from "next";
import { requireOrgContext } from "./org-context";
import { getTerminology } from "./terminology";

type Terminology = Awaited<ReturnType<typeof getTerminology>>;
type TermKey = Parameters<Terminology["term"]>[0];

/**
 * generateMetadata factory for destination pages whose visible header is a
 * terminology word: the browser tab must say what the page says. Cheap —
 * requireOrgContext and getTerminology are request-cached, so the page's own
 * calls are deduplicated.
 */
export function termTitleMetadata(key: TermKey) {
  return async function generateMetadata({
    params,
  }: {
    params: Promise<{ orgSlug: string }>;
  }): Promise<Metadata> {
    const { orgSlug } = await params;
    const ctx = await requireOrgContext(orgSlug);
    const { term } = await getTerminology(ctx.organization.id);
    return { title: term(key).plural };
  };
}
