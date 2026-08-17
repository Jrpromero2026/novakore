import type { Metadata } from "next";
import { can, requireOrgContext, requirePermission } from "@/lib/org-context";
import { getLibrary } from "@/lib/data/studio";
import { pageMeta, parsePage, rangeFor } from "@/lib/pagination";
import { Pagination } from "@/components/ui/pagination";
import { LibraryWorkspace } from "./library-workspace";

export const metadata: Metadata = { title: "Library · Studio" };

const BLOCKS_PER_PAGE = 50;

export default async function StudioLibraryPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { orgSlug } = await params;
  const sp = await searchParams;
  const ctx = await requireOrgContext(orgSlug);
  requirePermission(ctx, "content.view_draft");

  const page = parsePage(sp.page);
  const data = await getLibrary(
    ctx.organization.id,
    rangeFor(page, BLOCKS_PER_PAGE),
  );
  const meta = pageMeta(page, data.blocksTotal, BLOCKS_PER_PAGE);

  return (
    <div className="space-y-4">
      <LibraryWorkspace
        orgSlug={orgSlug}
        data={data}
        canManage={can(ctx, "library.manage")}
        canAuthor={can(ctx, "content.author")}
      />
      <Pagination
        meta={meta}
        basePath={`/${orgSlug}/admin/studio/library`}
        searchParams={sp}
        itemLabel="reusable blocks"
      />
    </div>
  );
}
