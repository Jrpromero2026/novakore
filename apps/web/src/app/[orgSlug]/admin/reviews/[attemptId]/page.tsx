import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrgContext, requirePermission } from "@/lib/org-context";
import { getReviewDetail } from "@/lib/data/assessments";
import { Badge, Card, CardHeader } from "@/components/ui/primitives";
import { Alert } from "@/components/ui/feedback";
import { ReviewForm } from "./review-form";

export const metadata: Metadata = { title: "Review attempt" };

export default async function ReviewDetailPage({
  params,
}: {
  params: Promise<{ orgSlug: string; attemptId: string }>;
}) {
  const { orgSlug, attemptId } = await params;
  const ctx = await requireOrgContext(orgSlug);
  requirePermission(ctx, "assessment.grade");

  const detail = await getReviewDetail(ctx.organization.id, attemptId);
  if (!detail) notFound();

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <p
          className="text-caption uppercase text-text-muted"
          style={{ letterSpacing: "var(--tracking-caps)" }}
        >
          <Link
            href={`/${orgSlug}/admin/reviews`}
            className="hover:text-text-primary"
          >
            Review queue
          </Link>{" "}
          / attempt
        </p>
        <h1 className="text-h1 text-text-primary">{detail.assessmentTitle}</h1>
        <p className="flex flex-wrap items-center gap-2 text-body-sm text-text-secondary">
          Attempt {detail.attemptNumber} · passing threshold{" "}
          {detail.passingPercent}%
          <Badge
            tone={
              detail.status === "pending_review"
                ? "warning"
                : detail.status === "passed"
                  ? "positive"
                  : "neutral"
            }
          >
            {detail.status.replace(/_/g, " ")}
          </Badge>
        </p>
      </header>

      {detail.status !== "pending_review" ? (
        <Alert tone="info" title="Already decided">
          This attempt has been finalized. Re-review is an audited
          assessment.override operation and is not available from this surface.
        </Alert>
      ) : (
        <ReviewForm orgSlug={orgSlug} detail={serializeDetail(detail)} />
      )}

      <Card>
        <CardHeader
          title="Objective answers (already graded)"
          description="Server-graded deterministically at submission; shown for context."
        />
        <ul className="divide-y divide-border-subtle">
          {detail.items
            .filter((i) => i.objective)
            .map((item) => {
              const response = detail.responses.get(item.id);
              return (
                <li
                  key={item.id}
                  className="flex items-center gap-3 px-5 py-3 text-body-sm"
                >
                  <span className="min-w-0 flex-1 text-text-primary">
                    {item.prompt}
                  </span>
                  <span className="font-mono text-caption text-text-muted">
                    {response?.pointsEarned ?? 0}/{item.points}
                  </span>
                  <Badge
                    tone={
                      response === undefined
                        ? "neutral"
                        : response.correct
                          ? "positive"
                          : "danger"
                    }
                  >
                    {response === undefined
                      ? "unanswered"
                      : response.correct
                        ? "correct"
                        : "incorrect"}
                  </Badge>
                </li>
              );
            })}
        </ul>
      </Card>
    </div>
  );
}

function serializeDetail(
  detail: NonNullable<Awaited<ReturnType<typeof getReviewDetail>>>,
) {
  return {
    attemptId: detail.attemptId,
    reviewStatus: detail.reviewStatus,
    subjectiveItems: detail.items
      .filter((i) => !i.objective)
      .map((item) => {
        const response = detail.responses.get(item.id);
        return {
          id: item.id,
          prompt: item.prompt,
          points: item.points,
          required: item.required,
          rubric: item.rubric,
          responseText:
            response === undefined
              ? null
              : String(
                  (response.response.text as string | undefined) ??
                    (response.response.note as string | undefined) ??
                    "",
                ),
        };
      }),
  };
}
