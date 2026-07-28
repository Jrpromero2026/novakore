import type { Metadata } from "next";
import Link from "next/link";
import { requireOrgContext, requirePermission } from "@/lib/org-context";
import { requireUser } from "@/lib/auth";
import { getReviewQueue } from "@/lib/data/assessments";
import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
} from "@/components/ui/primitives";

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
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-h1 text-text-primary">Review queue</h1>
        <p className="text-body-sm text-text-secondary">
          Submitted attempts with subjective work awaiting a decision. Reviewers
          can never grade their own attempts.
        </p>
      </header>

      <Card>
        <CardHeader title={`Awaiting review (${queue.length})`} />
        {queue.length === 0 ? (
          <EmptyState
            title="Nothing to review"
            description="Submitted attempts with subjective items will appear here."
          />
        ) : (
          <ul className="divide-y divide-border-subtle">
            {queue.map((entry) => (
              <li key={entry.attemptId}>
                <Link
                  href={`/${orgSlug}/admin/reviews/${entry.attemptId}`}
                  className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-surface-interactive"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body font-medium text-text-primary">
                      {entry.assessmentTitle}
                    </span>
                    <span className="text-caption text-text-muted">
                      Attempt {entry.attemptNumber}
                      {entry.submittedAt
                        ? ` · submitted ${new Date(entry.submittedAt).toLocaleString()}`
                        : ""}
                    </span>
                  </span>
                  {entry.claimedByMe ? (
                    <Badge tone="accent">claimed by you</Badge>
                  ) : null}
                  <Badge
                    tone={
                      entry.reviewStatus === "in_review" ? "warning" : "neutral"
                    }
                  >
                    {entry.reviewStatus.replace(/_/g, " ")}
                  </Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
