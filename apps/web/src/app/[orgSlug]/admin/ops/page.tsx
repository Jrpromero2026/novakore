import type { Metadata } from "next";
import Link from "next/link";
import { requireOrgContext, requirePermission } from "@/lib/org-context";
import { getFeedback, getOpsMetrics, getTesterCohorts } from "@/lib/data/ops";
import { TESTER_LABELS, testerLabelText } from "@/lib/feedback";
import { Card, CardHeader, cx } from "@/components/ui/primitives";
import { FeedbackReview } from "./ops-review";

export const metadata: Metadata = { title: "Operations" };

function one(v: string | string[] | undefined): string | undefined {
  return typeof v === "string" && v.length ? v : undefined;
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4 shadow-raised">
      <p className="text-2xl font-semibold tabular-nums text-text">{value}</p>
      <p className="mt-0.5 text-caption text-text-muted">{label}</p>
    </div>
  );
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

  const cohort = one(sp.cohort);
  const filters = {
    status: one(sp.status),
    category: one(sp.category),
    severity: one(sp.severity),
    q: one(sp.q),
  };

  const [metrics, feedback, cohorts] = await Promise.all([
    getOpsMetrics(ctx.organization.id, cohort),
    getFeedback(ctx.organization.id, filters),
    getTesterCohorts(ctx.organization.id),
  ]);

  const base = `/${orgSlug}/admin/ops`;
  const feedbackTotal = Object.values(metrics.feedbackByStatus).reduce(
    (a, b) => a + b,
    0,
  );

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="text-h1 text-text-primary">Operations</h1>
        <p className="text-body-sm text-text-secondary">
          Live alpha activity from the event log and tester feedback. Real data
          only.
        </p>
      </header>

      {/* Cohort filter */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-caption text-text-muted">Cohort:</span>
        <Link
          href={base}
          className={cx(
            "rounded-full px-3 py-1 text-caption",
            !cohort
              ? "bg-accent-soft text-accent"
              : "bg-surface-sunken text-text-muted hover:text-text",
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
                : "bg-surface-sunken text-text-muted hover:text-text",
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
        <StatTile label="Active learners" value={metrics.activeLearners} />
        <StatTile label="Enrollments" value={metrics.enrollments} />
        <StatTile label="Lessons started" value={metrics.lessonsStarted} />
        <StatTile label="Lessons completed" value={metrics.lessonsCompleted} />
        <StatTile label="Programs completed" value={metrics.coursesCompleted} />
        <StatTile
          label="Journeys completed"
          value={metrics.journeysCompleted}
        />
        <StatTile
          label="Evaluations passed"
          value={metrics.evaluationsPassed}
        />
        <StatTile
          label="Evaluations failed"
          value={metrics.evaluationsFailed}
        />
        <StatTile
          label="Credentials issued"
          value={metrics.credentialsIssued}
        />
        <StatTile label="Feedback items" value={feedbackTotal} />
      </section>

      {metrics.dropOff.length > 0 ? (
        <Card>
          <CardHeader
            title="Drop-off — started but not completed"
            description="Lessons with the largest started → completed gap in the event log."
          />
          <ul className="divide-y divide-border-subtle">
            {metrics.dropOff.map((d) => (
              <li
                key={d.lessonId}
                className="flex items-center gap-3 px-5 py-3 text-sm"
              >
                <span className="min-w-0 flex-1 truncate text-text">
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
                <span className="min-w-0 flex-1 truncate text-text">
                  {m.email ?? m.membershipId}
                </span>
                {m.labels.map((l) => (
                  <span
                    key={l}
                    className="rounded-full bg-surface-sunken px-2 py-0.5 text-[11px] text-text-muted"
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

      <FeedbackReview
        orgSlug={orgSlug}
        rows={feedback}
        filters={filters}
        basePath={base}
      />
    </div>
  );
}
