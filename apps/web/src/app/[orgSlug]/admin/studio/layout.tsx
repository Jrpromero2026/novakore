import type { ReactNode } from "react";
import { requireOrgContext, requirePermission } from "@/lib/org-context";
import { buildDomains } from "@/lib/navigation/domains";
import { AutoHeader } from "@/components/shell/auto-header";

/**
 * Authoring surfaces under /studio (ADR-020). Access requires draft
 * visibility — the same floor as every authoring surface; individual
 * actions stay gated by their own permissions.
 *
 * The eight-tab bar that used to sit here is gone. It was a second
 * persistent navigation layer duplicating sidebar entries (Courses and
 * Assessments appeared in both), and it carried its OWN Cmd-K palette
 * competing with the global one. The domain hierarchy replaces it; the
 * heading is now derived per route, because Library and the review queue
 * are different levels of the organization rather than tabs of one screen.
 */
export default async function StudioLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const ctx = await requireOrgContext(orgSlug);
  requirePermission(ctx, "content.view_draft");
  const domains = buildDomains(orgSlug, [...ctx.orgPermissions] as string[]);

  return (
    <div>
      <AutoHeader domains={domains} />
      {children}
    </div>
  );
}
