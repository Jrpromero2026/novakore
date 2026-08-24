import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/layout";
import { requireOrgContext, requirePermission } from "@/lib/org-context";
import { getSourceWorkspace } from "@/lib/data/studio";
import { SourcesWorkspace } from "./sources-workspace";

export const metadata: Metadata = { title: "Sources" };

export default async function SourcesPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const ctx = await requireOrgContext(orgSlug);
  requirePermission(ctx, "sources.manage");
  const sources = await getSourceWorkspace(ctx.organization.id);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Sources"
        description="One workspace for everything you build from: documents, data, images, and video. Text extraction is real or absent — a source never claims words it doesn't contain. Extracted sources feed the AI workspace as grounding."
      />
      <SourcesWorkspace orgSlug={orgSlug} sources={sources} />
    </div>
  );
}
