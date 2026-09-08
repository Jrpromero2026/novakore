import type { Metadata } from "next";
import { requireOrgContext, requirePermission } from "@/lib/org-context";
import { getSourceWorkspace } from "@/lib/data/studio";
import { SourcesWorkspace } from "./sources-workspace";

export const metadata: Metadata = { title: "Sources · Studio" };

export default async function SourcesPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const ctx = await requireOrgContext(orgSlug);
  requirePermission(ctx, "sources.manage");
  const sources = await getSourceWorkspace(ctx.organization.id);

  // The Studio layout's AutoHeader owns the breadcrumbs/title/description;
  // this page adds only its extraction-honesty contract below it.
  return (
    <div className="space-y-6">
      <p className="max-w-2xl text-body-sm text-text-secondary">
        Text extraction is real or absent — a source never claims words it
        doesn&apos;t contain. Extracted sources feed the AI workspace as
        grounding.
      </p>
      <SourcesWorkspace orgSlug={orgSlug} sources={sources} />
    </div>
  );
}
