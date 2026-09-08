import type { Metadata } from "next";
import { AutoBreadcrumbs } from "@/components/shell/auto-breadcrumbs";
import { notFound } from "next/navigation";
import { can, requireOrgContext, requirePermission } from "@/lib/org-context";
import { getTerminology } from "@/lib/terminology";
import { getPathBuilder } from "@/lib/data/studio";
import { PathBuilder } from "./path-builder";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ orgSlug: string; pathId: string }>;
}): Promise<Metadata> {
  const { orgSlug, pathId } = await params;
  const ctx = await requireOrgContext(orgSlug);
  const data = await getPathBuilder(ctx.organization.id, pathId);
  return { title: data ? `${data.title} · Canvas` : "Path canvas · Studio" };
}

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

  // This page owns its header (the Studio layout's AutoHeader stands down
  // for /studio/paths/*): the h1 is the path the user actually has open.
  return (
    <div className="space-y-4">
      <div>
        <AutoBreadcrumbs trail={[{ label: data.title }, { label: "Canvas" }]} />
        <h1 className="pt-2 text-h1 leading-tight tracking-tight text-text-primary">
          {data.title}
        </h1>
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
