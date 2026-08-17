import type { Metadata } from "next";
import { can, requireOrgContext, requirePermission } from "@/lib/org-context";
import { requireUser } from "@/lib/auth";
import { getStudioReviews } from "@/lib/data/studio";
import { pageMeta, parsePage, rangeFor } from "@/lib/pagination";
import { Pagination } from "@/components/ui/pagination";
import { ReviewWorkspace } from "./review-workspace";

export const metadata: Metadata = { title: "Review · Studio" };

const REVIEWS_PER_PAGE = 30;

export default async function StudioReviewPage({
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
  const user = await requireUser();

  // Review history accumulates permanently — page it.
  const page = parsePage(sp.page);
  const data = await getStudioReviews(
    ctx.organization.id,
    rangeFor(page, REVIEWS_PER_PAGE),
  );
  const meta = pageMeta(page, data.total, REVIEWS_PER_PAGE);

  return (
    <div className="space-y-4">
      <ReviewWorkspace
        orgSlug={orgSlug}
        data={data}
        currentUserId={user.id}
        canDecide={
          can(ctx, "content.publish") || can(ctx, "assessment.publish")
        }
      />
      <Pagination
        meta={meta}
        basePath={`/${orgSlug}/admin/studio/review`}
        searchParams={sp}
        itemLabel="review requests"
      />
    </div>
  );
}
