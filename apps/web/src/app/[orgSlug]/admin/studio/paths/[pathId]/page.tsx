import type { Metadata } from "next";
import { AutoBreadcrumbs } from "@/components/shell/auto-breadcrumbs";
import { notFound } from "next/navigation";
import { can, requireOrgContext, requirePermission } from "@/lib/org-context";
import { getTerminology } from "@/lib/terminology";
import { getPathBuilder } from "@/lib/data/studio";
import { PathBuilder } from "./path-builder";

export const metadata: Metadata = { title: "Path canvas · Studio" };

export default async function PathCanvasPage({
  params,
}: {
  params: Promise<{ orgSlug: string; pathId: string }>;
}) {
  const { orgSlug, pathId } = await params;
  const ctx = await requireOrgContext(orgSlug);
  requirePermission(ctx, "content.view_draft");
  const { term } = await getTerminology(ctx.organization.id);

  const data = await getPathBuilder(ctx.organization.id, pathId);
  if (!data) notFound();

  return (
    <div className="space-y-4">
      <div>
        {/*
          Pointed at /studio/paths, which now redirects to the management
          surface — a link that costs a round trip to reach a page the trail
          can name directly.
        */}
        <AutoBreadcrumbs trail={[{ label: data.title }, { label: "Canvas" }]} />
        <h2 className="pt-2 text-h3 text-text-primary">{data.title}</h2>
      </div>
      <PathBuilder
        orgSlug={orgSlug}
        data={data}
        canManage={can(ctx, "paths.manage")}
        courseTerm={term("course").singular}
      />
    </div>
  );
}
