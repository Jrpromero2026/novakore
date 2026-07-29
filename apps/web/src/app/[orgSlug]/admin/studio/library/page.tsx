import type { Metadata } from "next";
import { can, requireOrgContext, requirePermission } from "@/lib/org-context";
import { getLibrary } from "@/lib/data/studio";
import { LibraryWorkspace } from "./library-workspace";

export const metadata: Metadata = { title: "Library · Studio" };

export default async function StudioLibraryPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const ctx = await requireOrgContext(orgSlug);
  requirePermission(ctx, "content.view_draft");
  const data = await getLibrary(ctx.organization.id);

  return (
    <LibraryWorkspace
      orgSlug={orgSlug}
      data={data}
      canManage={can(ctx, "library.manage")}
      canAuthor={can(ctx, "content.author")}
    />
  );
}
