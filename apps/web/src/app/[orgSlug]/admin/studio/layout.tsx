import Link from "next/link";
import type { ReactNode } from "react";
import { requireOrgContext, requirePermission } from "@/lib/org-context";
import { getTerminology } from "@/lib/terminology";
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
    <div className="space-y-5">
      <header className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-border-subtle pb-4">
        <h1 className="text-h2 text-text-primary">Learning Studio</h1>
        <p className="text-caption text-text-muted">
          {ctx.organization.name} · {term("learning_path").plural},{" "}
          {term("course").plural.toLowerCase()},{" "}
          {term("assessment").plural.toLowerCase()}, and reusable content
        </p>
        <span className="ml-auto">
          <Link
            href={`/${orgSlug}/admin`}
            className="text-body-sm text-text-muted hover:text-text-primary"
          >
            ← Admin
          </Link>
        </span>
      </header>
      <StudioNav orgSlug={orgSlug} />
      {children}
    </div>
  );
}
