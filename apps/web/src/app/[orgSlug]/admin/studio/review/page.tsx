import type { Metadata } from "next";
import { can, requireOrgContext, requirePermission } from "@/lib/org-context";
import { requireUser } from "@/lib/auth";
import { getStudioReviews } from "@/lib/data/studio";
import { ReviewWorkspace } from "./review-workspace";

export const metadata: Metadata = { title: "Review · Studio" };

export default async function StudioReviewPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const ctx = await requireOrgContext(orgSlug);
  requirePermission(ctx, "content.view_draft");
  const user = await requireUser();
  const data = await getStudioReviews(ctx.organization.id);

  return (
    <ReviewWorkspace
      orgSlug={orgSlug}
      data={data}
      currentUserId={user.id}
      canDecide={can(ctx, "content.publish") || can(ctx, "assessment.publish")}
    />
  );
}
