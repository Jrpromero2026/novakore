import type { Metadata } from "next";
import Link from "next/link";
import { requireOrgContext, requirePermission } from "@/lib/org-context";
import { getTerminology } from "@/lib/terminology";
import { getFeedback, getOpsMetrics, getTesterCohorts } from "@/lib/data/ops";
import { TESTER_LABELS, testerLabelText } from "@/lib/feedback";
import { Card, CardHeader, cx } from "@/components/ui/primitives";
import { OnboardingPageMarker } from "@/components/onboarding/page-marker";
import { pageMeta, parsePage, rangeFor } from "@/lib/pagination";
import { Pagination } from "@/components/ui/pagination";
import { MetricCard } from "@/components/dashboard/widgets";
import { FeedbackReview } from "./ops-review";
import { PageHeader } from "@/components/ui/layout";

export const metadata: Metadata = { title: "Operations" };

function one(v: string | string[] | undefined): string | undefined {
  return typeof v === "string" && v.length ? v : undefined;
}

export default async function OperationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { orgSlug } = await params;
  const sp = await searchParams;
  const ctx = await requireOrgContext(orgSlug);
  requirePermission(ctx, "analytics.view");
  const { term } = await getTerminology(ctx.organization.id);

  const cohort = one(sp.cohort);
  const filters = {
    status: one(sp.status),
    category: one(sp.category),
    severity: one(sp.severity),
    q: one(sp.q),
  };

  // Feedback is filtered AND paged; the total below reflects the filters,
  // so the pager never promises rows the current filter cannot show.
  const feedbackPage = parsePage(sp.page);
  const feedbackPageTotals = { total: 0 };
  const [metrics, feedback, cohorts] = await Promise.all([
    getOpsMetrics(ctx.organization.id, cohort),
    getFeedback(
      ctx.organization.id,
      filters,
      rangeFor(feedbackPage),
      feedbackPageTotals,
    ),
    getTesterCohorts(ctx.organization.id),
  ]);

  const base = `/${orgSlug}/admin/ops`;
  const feedbackTotal = Object.values(metrics.feedbackByStatus).reduce(
    (a, b) => a + b,
    0,
  );

  return (
    <div className="space-y-8">
      <OnboardingPageMarker
        orgSlug={orgSlug}
        event="onboarding.progress.reviewed"
      />
      <PageHeader
        title="Operations"
        description="Live workspace activity from the event log and tester feedback. Real data only."
      />

      {/* Cohort filter */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-caption text-text-muted">Cohort:</span>
        <Link
          href={base}
          className={cx(
            "rounded-full px-3 py-1 text-caption",
            !cohort
              ? "bg-accent-soft text-accent"
              : "bg-background-subtle text-text-muted hover:text-text-primary",
          )}
        >
          All
        </Link>
        {TESTER_LABELS.map((l) => (
          <Link
            key={l.value}
            href={`${base}?cohort=${l.value}`}
            className={cx(
              "rounded-full px-3 py-1 text-caption",
              cohort === l.value
                ? "bg-accent-soft text-accent"
                : "bg-background-subtle text-text-muted hover:text-text-primary",
            )}
          >
            {l.label}
          </Link>
        ))}
      </div>

      <section
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5"
        aria-label="Activity metrics"
      >
        <MetricCard
          label={`Active ${term("learner").plural.toLowerCase()}`}
          value={metrics.activeLearners}
        />
        <MetricCard
          label={term("enrollment").plural}
          value={metrics.enrollments}
        />
        <MetricCard
          label={`${term("lesson").plural} started`}
          value={metrics.lessonsStarted}
        />
        <MetricCard
          label={`${term("lesson").plural} completed`}
          value={metrics.lessonsCompleted}
        />
        <MetricCard
          label={`${term("course").plural} completed`}
          value={metrics.coursesCompleted}
        />
        <MetricCard
          label={`${term("learning_path").plural} completed`}
          value={metrics.journeysCompleted}
        />
        <MetricCard
          label="Evaluations passed"
          value={metrics.evaluationsPassed}
        />
        <MetricCard
          label="Evaluations failed"
          value={metrics.evaluationsFailed}
        />
        <MetricCard
          label={`${term("credential").plural} issued`}
          value={metrics.credentialsIssued}
        />
        <MetricCard label="Feedback items" value={feedbackTotal} />
      </section>

      {metrics.dropOff.length > 0 ? (
        <Card>
          <CardHeader
            title="Drop-off — started but not completed"
            description={`${term("lesson").plural} with the largest started → completed gap in the event log.`}
          />
          <ul className="divide-y divide-border-subtle">
            {metrics.dropOff.map((d) => (
              <li
                key={d.lessonId}
                className="flex items-center gap-3 px-5 py-3 text-sm"
              >
                <span className="min-w-0 flex-1 truncate text-text-primary">
                  {d.title}
                </span>
                <span className="text-caption text-text-muted tabular-nums">
                  {d.completed}/{d.started} completed
                </span>
                <span className="text-caption font-medium text-warning tabular-nums">
                  −{d.gap}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card>
        <CardHeader
          title="Tester cohorts"
          description="Label members for cohort-filtered dashboards."
        />
        {cohorts.length ? (
          <ul className="divide-y divide-border-subtle">
            {cohorts.map((m) => (
              <li
                key={m.membershipId}
                className="flex flex-wrap items-center gap-2 px-5 py-3 text-sm"
              >
                <span className="min-w-0 flex-1 truncate text-text-primary">
                  {m.email ?? m.membershipId}
                </span>
                {m.labels.map((l) => (
                  <span
                    key={l}
                    className="rounded-full bg-background-subtle px-2 py-0.5 text-[11px] text-text-muted"
                  >
                    {testerLabelText(l)}
                  </span>
                ))}
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-5 py-4 text-body-sm text-text-muted">
            No tester labels yet.
          </p>
        )}
      </Card>

      <div>
        <FeedbackReview
          orgSlug={orgSlug}
          rows={feedback}
          filters={filters}
          basePath={base}
        />
        <Pagination
          meta={pageMeta(feedbackPage, feedbackPageTotals.total)}
          basePath={base}
          searchParams={sp}
          itemLabel="feedback items"
        />
      </div>
    </div>
  );
}
