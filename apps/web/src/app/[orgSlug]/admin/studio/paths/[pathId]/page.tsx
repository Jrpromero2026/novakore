import type { Metadata } from "next";
import Link from "next/link";
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
      <div className="flex flex-wrap items-baseline gap-x-3">
        <p
          className="text-caption uppercase text-text-muted"
          style={{ letterSpacing: "var(--tracking-caps)" }}
        >
          <Link
            href={`/${orgSlug}/admin/studio/paths`}
            className="hover:text-text-primary"
          >
            {term("learning_path").plural}
          </Link>{" "}
          / canvas
        </p>
        <h2 className="text-h3 text-text-primary">{data.title}</h2>
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
