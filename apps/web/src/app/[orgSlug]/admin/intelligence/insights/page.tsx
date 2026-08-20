import type { Metadata } from "next";
import { can, requireOrgContext, requirePermission } from "@/lib/org-context";
import { getNovaReport } from "@/lib/data/nova";
import { Panel, PageHeader, SectionHeader } from "@/components/ui/layout";
import { NovaIntelligence } from "@/components/dashboard/command-center";
import { ActivitySparkline } from "@/components/dashboard/viz";
import { AnimatedNumber } from "@/components/ui/motion";
import { IconArrowRight } from "@/components/ui/icons";
import Link from "next/link";

export const metadata: Metadata = { title: "Nova Intelligence" };

/**
 * The Nova Intelligence surface: the organization's knowledge system,
 * understood. Every score is an explained ratio of real records, every
 * insight a grounded observation with an action, every digest line a count
 * from the event log. Where there is no basis, Nova says so — it never
 * invents a number to fill a card.
 */
export default async function IntelligencePage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const ctx = await requireOrgContext(orgSlug);
  requirePermission(ctx, "content.view_draft");
  const includeLearner = can(ctx, "analytics.view");

  const report = await getNovaReport(ctx.organization.id, orgSlug, {
    includeLearner,
    membershipId: ctx.membershipId,
  });

  return (
    <div className="space-y-8">
      <PageHeader
        title="Insights"
        description="How your knowledge system is doing — every score explained, every observation grounded in real records."
      />

      {/* ---- Knowledge scorecard ----------------------------------------- */}
      <section aria-label="Knowledge scorecard">
        <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3">
          {report.scorecard.map((dim, i) => (
            <Link
              key={dim.key}
              href={dim.href ?? "#"}
              style={{ "--nk-stagger": String(Math.min(i, 5)) } as never}
              className="nk-card nk-rise group flex flex-col justify-between gap-3 rounded-xl border border-border-subtle bg-surface-elevated p-4 shadow-raised"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-caption font-medium uppercase tracking-[var(--tracking-caps)] text-text-muted">
                  {dim.label}
                </p>
                <IconArrowRight
                  size={13}
                  className="shrink-0 text-text-muted opacity-0 transition-opacity duration-[var(--motion-fast)] group-hover:opacity-100"
                />
              </div>
              <div>
                <p className="flex items-baseline gap-1.5">
                  {dim.pct === null ? (
                    <span className="text-[1.75rem] font-semibold leading-none text-text-muted">
                      —
                    </span>
                  ) : (
                    <>
                      <span className="text-[1.75rem] font-semibold leading-none tracking-tight tabular-nums text-text-primary">
                        <AnimatedNumber value={dim.pct} />
                      </span>
                      <span className="text-body-sm text-text-muted">%</span>
                    </>
                  )}
                  <span className="ml-auto text-caption tabular-nums text-text-muted">
                    {dim.pct === null ? "no data yet" : `${dim.n} of ${dim.m}`}
                  </span>
                </p>
                {dim.pct !== null ? (
                  <div
                    aria-hidden
                    className="mt-2.5 h-1 w-full overflow-hidden rounded-full bg-border-subtle"
                  >
                    <div
                      className="h-full rounded-full bg-accent"
                      style={{ width: `${dim.pct}%` }}
                    />
                  </div>
                ) : null}
                <p className="mt-2 text-caption leading-relaxed text-text-muted">
                  {dim.explain}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ---- Executive digest --------------------------------------------- */}
      {report.digest ? (
        <section aria-label="Executive digest">
          <SectionHeader
            title="This week"
            description="Two real windows, side by side — counts from the event log, not projections"
          />
          <Panel tone="elevated" className="mt-3 overflow-x-auto p-0">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-border-subtle text-caption font-medium uppercase tracking-[var(--tracking-caps)] text-text-muted">
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    Signal
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-2.5 text-right font-medium"
                  >
                    This week
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-2.5 text-right font-medium"
                  >
                    Last week
                  </th>
                </tr>
              </thead>
              <tbody className="text-body-sm">
                {(
                  [
                    ["Lessons published", "lessonsPublished"],
                    ["Journeys completed", "journeysCompleted"],
                    ["Evaluations passed", "evaluationsPassed"],
                    ["Evaluations failed", "evaluationsFailed"],
                    ["New enrollments", "enrollments"],
                  ] as const
                ).map(([label, key]) => (
                  <tr
                    key={key}
                    className="border-b border-border-subtle last:border-0"
                  >
                    <th
                      scope="row"
                      className="px-4 py-2.5 font-normal text-text-secondary"
                    >
                      {label}
                    </th>
                    <td className="px-4 py-2.5 text-right font-medium tabular-nums text-text-primary">
                      {report.digest!.thisWeek[key]}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-text-muted">
                      {report.digest!.lastWeek[key]}
                    </td>
                  </tr>
                ))}
                <tr>
                  <th
                    scope="row"
                    className="px-4 py-2.5 font-normal text-text-secondary"
                  >
                    Reviews awaiting a decision
                  </th>
                  <td className="px-4 py-2.5 text-right font-medium tabular-nums text-text-primary">
                    {report.digest.openReviews}
                  </td>
                  <td className="px-4 py-2.5 text-right text-caption text-text-muted">
                    now
                  </td>
                </tr>
              </tbody>
            </table>
          </Panel>
        </section>
      ) : null}

      {/* ---- Grounded observations ----------------------------------------- */}
      <section aria-label="Nova observations">
        <NovaIntelligence insights={report.insights} />
      </section>

      {/* ---- Knowledge evolution -------------------------------------------- */}
      <section aria-label="Knowledge evolution">
        <SectionHeader
          title="Knowledge evolution"
          description="Cumulative published lesson versions — how the knowledge base has grown, week by week"
        />
        <Panel tone="outlined" className="mt-3 p-4">
          {report.evolution.length === 0 ? (
            <p className="text-body-sm text-text-muted">
              The evolution curve appears after the first publish — every point
              is a real published version.
            </p>
          ) : (
            <>
              <ActivitySparkline
                data={report.evolution.map((e) => ({
                  day: e.week,
                  count: e.cumulative,
                }))}
                label="Cumulative published lesson versions by week"
              />
              <p className="mt-2 text-caption tabular-nums text-text-muted">
                {report.evolution.at(-1)?.cumulative} published versions across{" "}
                {report.evolution.length}{" "}
                {report.evolution.length === 1 ? "week" : "weeks"}
              </p>
            </>
          )}
        </Panel>
      </section>
    </div>
  );
}
