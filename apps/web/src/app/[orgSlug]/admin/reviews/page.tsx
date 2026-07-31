import type { Metadata } from "next";
import { relativeTime } from "@/lib/format";
import {
  DataRow,
  PageHeader,
  Panel,
  SectionHeader,
} from "@/components/ui/layout";
import { requireOrgContext, requirePermission } from "@/lib/org-context";
import { requireUser } from "@/lib/auth";
import { getReviewQueue } from "@/lib/data/assessments";
import { Badge, EmptyState } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Review queue" };

export default async function ReviewQueuePage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const ctx = await requireOrgContext(orgSlug);
  requirePermission(ctx, "assessment.grade");
  const user = await requireUser();
  const queue = await getReviewQueue(ctx.organization.id, user.id);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Learning"
        title="Review queue"
        description="Submitted attempts with subjective work awaiting a decision. Reviewers can never grade their own attempts."
      />

      <section>
        <SectionHeader title="Awaiting review" count={queue.length} />
        <Panel tone="outlined" className="mt-2.5">
          {queue.length === 0 ? (
            <EmptyState
              title="Nothing to review"
              description="Submitted attempts with subjective items land here. The queue is clear."
            />
          ) : (
            <ul className="p-1.5">
              {queue.map((entry) => (
                <li key={entry.attemptId}>
                  <DataRow
                    href={`/${orgSlug}/admin/reviews/${entry.attemptId}`}
                    title={entry.assessmentTitle}
                    meta={`Attempt ${entry.attemptNumber}${
                      entry.submittedAt
                        ? ` · submitted ${relativeTime(entry.submittedAt)}`
                        : ""
                    }`}
                    trailing={
                      <>
                        {entry.claimedByMe ? (
                          <Badge tone="accent">claimed by you</Badge>
                        ) : null}
                        <Badge
                          tone={
                            entry.reviewStatus === "in_review"
                              ? "warning"
                              : "neutral"
                          }
                        >
                          {entry.reviewStatus.replace(/_/g, " ")}
                        </Badge>
                      </>
                    }
                  />
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </section>
    </div>
  );
}
