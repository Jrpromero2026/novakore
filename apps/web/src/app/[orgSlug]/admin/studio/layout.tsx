import Link from "next/link";
import type { ReactNode } from "react";
import { requireOrgContext, requirePermission } from "@/lib/org-context";
import { getTerminology } from "@/lib/terminology";
import { PageHeader } from "@/components/ui/layout";
import { StudioNav } from "./studio-nav";

/**
 * Learning Studio shell (ADR-020). Access requires draft visibility —
 * the same floor as every authoring surface; individual actions stay
 * gated by their own permissions.
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
  const { term } = await getTerminology(ctx.organization.id);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Knowledge"
        title="Learning Studio"
        description={`${term("learning_path").plural}, ${term("course").plural.toLowerCase()}, ${term("assessment").plural.toLowerCase()}, and reusable content for ${ctx.organization.name}.`}
        actions={
          <Link
            href={`/${orgSlug}/admin`}
            className="rounded-md border border-border-strong px-3.5 py-1.5 text-body-sm font-medium text-text-primary transition-colors duration-[var(--motion-fast)] hover:bg-surface-interactive"
          >
            Back to workspace
          </Link>
        }
      />
      <StudioNav orgSlug={orgSlug} />
      {children}
    </div>
  );
}
