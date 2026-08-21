import type { Metadata } from "next";
import type { CSSProperties, ReactNode } from "react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { can, requireOrgContext } from "@/lib/org-context";
import { landingPathFor } from "@/lib/navigation/landing";
import { getUser } from "@/lib/auth";
import { getTerminology } from "@/lib/terminology";
import { supabaseServer } from "@/lib/supabase/server";
import { getStudioHome, type StudioHome } from "@/lib/data/studio";
import { getOpsMetrics, type OpsMetrics } from "@/lib/data/ops";
import {
  getContentComposition,
  getWorkspacePulse,
  type ContentComposition,
  type WorkspacePulse,
} from "@/lib/data/workspace";
import { handleFromEmail, relativeTime } from "@/lib/format";
import { Badge } from "@/components/ui/primitives";
import { Panel, SectionHeader, StatusDot } from "@/components/ui/layout";
import {
  IconAssessment,
  IconAi,
  IconBranding,
  IconCourse,
  IconEnrollment,
  IconLibrary,
  IconPath,
  IconStudio,
} from "@/components/ui/icons";
import { Greeting } from "@/components/dashboard/greeting";
import { OnboardingChecklist } from "@/components/onboarding/checklist";
import { getOnboardingSnapshot } from "@/lib/data/onboarding";
import { resolveChecklist } from "@/lib/onboarding/steps";
import {
  CreateActions,
  MetricCard,
  ViewAll,
} from "@/components/dashboard/widgets";
import { ActivitySparkline, CompositionBar } from "@/components/dashboard/viz";
import {
  HeroStat,
  NovaIntelligence,
  PriorityCenter,
  type NovaInsight,
  type PriorityItem,
} from "@/components/dashboard/command-center";

export const metadata: Metadata = { title: "Overview" };

const toneWeight: Record<NovaInsight["tone"], number> = {
  danger: 0,
  warning: 1,
  accent: 2,
  neutral: 3,
  positive: 4,
};

export default async function OrgOverviewPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const ctx = await requireOrgContext(orgSlug);

  // A bookmark, an old link, or the sign-in redirect from before this fix can
  // still land a learner here, where the whole page resolves to empty panels.
  // Only the INDEX redirects: a deep link to a specific admin page keeps
  // showing the access-denied surface, which explains itself, rather than
  // silently teleporting someone away from the thing they asked for.
  const landing = landingPathFor(orgSlug, [...ctx.orgPermissions] as string[]);
  if (landing !== `/${orgSlug}/admin`) redirect(landing);

  const supabase = await supabaseServer();
  const { term } = await getTerminology(ctx.organization.id);
  const user = await getUser();
  const base = `/${orgSlug}/admin`;

  const canStudio = can(ctx, "content.view_draft");
  const canAnalytics = can(ctx, "analytics.view");
  const canMembers = can(ctx, "org.members.manage");

  const [
    { count: academyCount },
    membersResult,
    studio,
    ops,
    pulse,
    composition,
    onboarding,
  ] = await Promise.all([
    supabase
      .from("academies")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", ctx.organization.id)
      .neq("status", "archived"),
    canMembers
      ? supabase
          .from("organization_memberships")
          .select("status")
          .eq("organization_id", ctx.organization.id)
      : Promise.resolve({ data: null }),
    canStudio
      ? getStudioHome(ctx.organization.id)
      : Promise.resolve(null as StudioHome | null),
    canAnalytics
      ? getOpsMetrics(ctx.organization.id)
      : Promise.resolve(null as OpsMetrics | null),
    canAnalytics
      ? getWorkspacePulse(ctx.organization.id, { resolveActors: canMembers })
      : Promise.resolve(null as WorkspacePulse | null),
    canStudio
      ? getContentComposition(ctx.organization.id)
      : Promise.resolve(null as ContentComposition | null),
    getOnboardingSnapshot(ctx.organization.id, ctx.membershipId),
  ]);

  // ---- Academy Launch — completion derived from the real data above -------
  const checklist = resolveChecklist(
    onboarding.signals,
    ctx.orgPermissions,
    term,
    base,
  );
  const launchMode =
    checklist.totalCount > 0 &&
    !checklist.allComplete &&
    onboarding.lifecycle.dismissedAt === null;

  const members = membersResult.data;
  const activeMembers = members
    ? members.filter((m) => m.status === "active").length
    : null;
  const invitedMembers = members
    ? members.filter((m) => m.status === "invited").length
    : 0;
  const openFeedback = ops
    ? Object.entries(ops.feedbackByStatus)
        .filter(([status]) => status !== "resolved" && status !== "dismissed")
        .reduce((sum, [, n]) => sum + n, 0)
    : null;

  const knowledgeAssets = studio
    ? studio.counts.courses +
      studio.counts.paths +
      studio.counts.assessments +
      studio.counts.libraryBlocks
    : null;

  // Knowledge health = real publishing readiness (published / total courses).
  const publishingReadiness =
    composition && composition.total > 0
      ? Math.round((composition.published / composition.total) * 100)
      : null;

  // ---- Nova Intelligence — every insight from a real, current condition ----
  const insights: NovaInsight[] = [];
  const topDropOff = ops?.dropOff[0];
  if (topDropOff && topDropOff.started > 0) {
    insights.push({
      id: "dropoff",
      tone: "warning",
      observation: `“${topDropOff.title}” has a start-to-complete gap.`,
      detail: `${topDropOff.completed} of ${topDropOff.started} learners who started it have finished.`,
      action: { label: "Review", href: `${base}/ops` },
    });
  }
  if (ops && ops.evaluationsPassed + ops.evaluationsFailed > 0) {
    const total = ops.evaluationsPassed + ops.evaluationsFailed;
    const rate = Math.round((ops.evaluationsPassed / total) * 100);
    if (rate < 60) {
      insights.push({
        id: "eval-rate",
        tone: "warning",
        observation: `Evaluation pass rate is ${rate}%.`,
        detail: `${ops.evaluationsPassed} passed of ${total} graded attempts.`,
        action: { label: "Open", href: `${base}/ops` },
      });
    }
  }
  if (studio && studio.openReviews.length > 0) {
    insights.push({
      id: "reviews",
      tone: "accent",
      observation: `${studio.openReviews.length} content ${studio.openReviews.length === 1 ? "review is" : "reviews are"} awaiting a decision.`,
      action: { label: "Review", href: `${base}/studio/review` },
    });
  }
  if (composition && composition.draft > 0) {
    insights.push({
      id: "drafts",
      tone: "neutral",
      observation: `${composition.draft} ${composition.draft === 1 ? "course is" : "courses are"} in draft, not yet delivered to learners.`,
      action: { label: "Open", href: `${base}/courses` },
    });
  }
  if (openFeedback !== null && openFeedback > 0) {
    insights.push({
      id: "feedback",
      tone: "warning",
      observation: `${openFeedback} open feedback ${openFeedback === 1 ? "item" : "items"} from testers.`,
      action: { label: "Open", href: `${base}/ops` },
    });
  }
  if (
    insights.length === 0 &&
    composition &&
    composition.total > 0 &&
    composition.draft === 0
  ) {
    insights.push({
      id: "healthy",
      tone: "positive",
      observation: `Publishing is healthy — all ${composition.total} ${composition.total === 1 ? "course is" : "courses are"} live.`,
    });
  }
  insights.sort((a, b) => toneWeight[a.tone] - toneWeight[b.tone]);
  const heroSummary =
    insights[0]?.observation ??
    `Everything looks healthy across ${ctx.organization.name}.`;

  // ---- Priority Center — real actionable conditions, mapped to bands -------
  const priority: PriorityItem[] = [];
  if (studio && studio.openReviews.length > 0) {
    priority.push({
      id: "reviews",
      band: "review",
      title: `${studio.openReviews.length} content ${studio.openReviews.length === 1 ? "review" : "reviews"} awaiting a decision`,
      meta: "Studio · review queue",
      href: `${base}/studio/review`,
    });
  }
  if (studio && studio.draftCourses.length > 0) {
    priority.push({
      id: "drafts",
      band: "publishing",
      title: `${studio.draftCourses.length} ${studio.draftCourses.length === 1 ? "course" : "courses"} still in draft`,
      meta: "Not yet delivered to learners",
      href: `${base}/courses`,
    });
  }
  if (openFeedback !== null && openFeedback > 0) {
    priority.push({
      id: "feedback",
      band: "feedback",
      title: `${openFeedback} open feedback ${openFeedback === 1 ? "item" : "items"}`,
      meta: "Analytics · feedback review",
      href: `${base}/ops`,
    });
  }
  if (invitedMembers > 0) {
    priority.push({
      id: "invites",
      band: "system",
      title: `${invitedMembers} pending ${invitedMembers === 1 ? "invitation" : "invitations"}`,
      meta: "Members have not accepted yet",
      href: `${base}/members`,
    });
  }

  const createActions = [
    ...(canStudio
      ? [
          {
            href: `${base}/studio`,
            label: "Compose in Studio",
            description: "Author lessons and structure",
            icon: IconStudio,
          },
          {
            href: `${base}/courses`,
            label: "Create course",
            description: "Start a versioned course",
            icon: IconCourse,
          },
        ]
      : []),
    ...(can(ctx, "paths.manage")
      ? [
          {
            href: `${base}/learning`,
            label: "Create learning path",
            description: "Sequence courses into journeys",
            icon: IconPath,
          },
        ]
      : []),
    ...(can(ctx, "assessment.author")
      ? [
          {
            href: `${base}/assessments`,
            label: "Create assessment",
            description: "Governed evaluation",
            icon: IconAssessment,
          },
        ]
      : []),
    ...(canStudio
      ? [
          {
            href: `${base}/studio/library`,
            label: "Open library",
            description: "Reusable content blocks",
            icon: IconLibrary,
          },
          {
            href: `${base}/studio/ai`,
            label: "Open AI Studio",
            description: "Governed drafting assistance",
            icon: IconAi,
          },
        ]
      : []),
    ...(canMembers
      ? [
          {
            href: `${base}/members`,
            label: "Invite member",
            description: "Grow the organization",
            icon: IconEnrollment,
          },
        ]
      : []),
    ...(can(ctx, "org.branding.manage")
      ? [
          {
            href: `${base}/branding`,
            label: "Configure branding",
            description: "Theme and identity",
            icon: IconBranding,
          },
        ]
      : []),
  ];

  // Executive metric cards — real values, honest context, lead emphasized.
  const metrics: {
    key: string;
    label: string;
    value: number;
    context?: ReactNode;
    href?: string;
    icon?: typeof IconStudio;
    emphasis?: boolean;
    accent?: boolean;
  }[] = [];
  if (knowledgeAssets !== null && studio) {
    metrics.push({
      key: "assets",
      label: "Knowledge assets",
      value: knowledgeAssets,
      icon: IconStudio,
      href: `${base}/studio`,
      emphasis: true,
      accent: true,
      context: (
        <span>
          {studio.counts.courses} courses · {studio.counts.paths} paths ·{" "}
          {studio.counts.libraryBlocks} blocks
        </span>
      ),
    });
  }
  if (ops) {
    metrics.push(
      {
        key: "learners",
        label: "Active learners",
        value: ops.activeLearners,
        icon: IconEnrollment,
        context: <span>{ops.enrollments} enrollments</span>,
      },
      {
        key: "lessons",
        label: "Lessons completed",
        value: ops.lessonsCompleted,
        icon: IconCourse,
        context: <span>of {ops.lessonsStarted} started</span>,
      },
      {
        key: "journeys",
        label: "Journeys completed",
        value: ops.journeysCompleted,
        icon: IconPath,
        context: <span>{ops.coursesCompleted} courses</span>,
      },
      {
        key: "credentials",
        label: "Credentials issued",
        value: ops.credentialsIssued,
        icon: IconAssessment,
        href: `${base}/credentials`,
      },
    );
  }
  if (activeMembers !== null) {
    metrics.push({
      key: "members",
      label: "Members",
      value: activeMembers,
      icon: IconEnrollment,
      href: `${base}/members`,
      context:
        invitedMembers > 0 ? (
          <span>{invitedMembers} invited</span>
        ) : (
          <span>all active</span>
        ),
    });
  }
  metrics.push({
    key: "academies",
    label: term("academy").plural,
    value: academyCount ?? 0,
    href: `${base}/academies`,
  });

  return (
    <div className="space-y-8">
      {/* ---- Hero — command center opening ------------------------------- */}
      <Panel tone="hero" className="nk-fade-up rounded-xl p-6 sm:p-7">
        <div className="grid gap-x-8 gap-y-6 lg:grid-cols-[1.35fr_1fr]">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-caption font-medium uppercase tracking-[var(--tracking-caps)] text-text-muted">
              {ctx.organization.name}
              <StatusDot
                tone={
                  ctx.organization.status === "active" ? "positive" : "warning"
                }
                label={ctx.organization.status}
              />
            </p>
            <h1 className="mt-2 text-[1.875rem] font-semibold leading-tight tracking-tight text-text-primary">
              <Greeting name={handleFromEmail(user?.email)} />
            </h1>
            <p className="mt-2 flex items-start gap-2 text-body-sm leading-relaxed text-text-secondary">
              <IconAi
                size={15}
                className="mt-0.5 shrink-0 text-accent"
                aria-hidden
              />
              <span>{heroSummary}</span>
            </p>
            {canStudio ? (
              <div className="mt-5 flex flex-wrap items-center gap-2">
                <Link
                  href={`${base}/studio`}
                  className="rounded-md bg-accent px-4 py-2 text-body-sm font-medium text-accent-contrast transition-colors duration-[var(--motion-fast)] hover:bg-accent-hover"
                >
                  Open Studio
                </Link>
                <Link
                  href={`${base}/courses`}
                  className="rounded-md border border-border-strong px-4 py-2 text-body-sm font-medium text-text-primary transition-colors duration-[var(--motion-fast)] hover:bg-surface-interactive"
                >
                  Courses
                </Link>
              </div>
            ) : null}
          </div>

          <div className="flex flex-col justify-between gap-5 border-t border-border-subtle pt-5 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
            <div>
              <p className="text-caption font-medium uppercase tracking-[var(--tracking-caps)] text-text-muted">
                Knowledge health
              </p>
              {publishingReadiness !== null && composition ? (
                <>
                  <p className="mt-1 flex items-baseline gap-1.5">
                    <span className="text-[1.75rem] font-semibold leading-none tracking-tight tabular-nums text-text-primary">
                      {publishingReadiness}%
                    </span>
                    <span className="text-caption text-text-muted">
                      of courses published
                    </span>
                  </p>
                  <div className="mt-3">
                    <CompositionBar composition={composition} />
                  </div>
                </>
              ) : (
                <p className="mt-1.5 text-body-sm text-text-muted">
                  {canStudio
                    ? "Publish your first course to start tracking readiness."
                    : "Publishing detail requires content access."}
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-x-8 gap-y-3">
              {ops ? (
                <HeroStat
                  label="Active learners"
                  value={ops.activeLearners.toLocaleString()}
                />
              ) : null}
              {knowledgeAssets !== null ? (
                <HeroStat
                  label="Knowledge assets"
                  value={knowledgeAssets.toLocaleString()}
                />
              ) : null}
              {activeMembers !== null ? (
                <HeroStat
                  label="Members"
                  value={activeMembers.toLocaleString()}
                />
              ) : null}
            </div>
          </div>
        </div>
      </Panel>

      {/* ---- Academy Launch — leads until the org is fully set up -------- */}
      <OnboardingChecklist
        orgSlug={orgSlug}
        view={checklist}
        dismissed={onboarding.lifecycle.dismissedAt !== null}
        celebrated={onboarding.lifecycle.completedCelebratedAt !== null}
        canManage={can(ctx, "org.manage")}
      />

      {/* ---- Executive metrics — deferred while launch is in progress so a
              brand-new organization is not greeted by a wall of zeros ------ */}
      {metrics.length > 0 && !launchMode ? (
        <section aria-label="Executive metrics">
          <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
            {metrics.map((m, i) => (
              <MetricCard
                key={m.key}
                label={m.label}
                value={m.value}
                context={m.context}
                href={m.href}
                icon={m.icon}
                emphasis={m.emphasis}
                accent={m.accent}
                stagger={Math.min(i, 5)}
              />
            ))}
          </div>
        </section>
      ) : null}

      {/* ---- Nova Intelligence ------------------------------------------- */}
      {canStudio || canAnalytics ? (
        <section aria-label="Nova Intelligence">
          <NovaIntelligence
            insights={insights}
            moreHref={canStudio ? `${base}/intelligence` : undefined}
          />
        </section>
      ) : null}

      {/* ---- Priority Center + Activity ---------------------------------- */}
      <div className="grid gap-x-6 gap-y-8 lg:grid-cols-2">
        <section aria-label="Priority center">
          <SectionHeader title="Priority center" count={priority.length} />
          <div className="mt-3">
            <PriorityCenter items={priority} />
          </div>
        </section>

        <section aria-label="Recent activity">
          <SectionHeader
            title="Activity"
            action={
              canAnalytics ? (
                <ViewAll href={`${base}/ops`}>Analytics</ViewAll>
              ) : undefined
            }
          />
          <div className="mt-3">
            {pulse ? (
              <Panel tone="outlined" className="p-4">
                {pulse.windowTotal > 0 ? (
                  <div className="mb-4 border-b border-border-subtle pb-4">
                    <div className="flex items-baseline justify-between gap-3">
                      <h3 className="text-label font-medium text-text-secondary">
                        Workspace activity
                      </h3>
                      <p className="text-caption tabular-nums text-text-muted">
                        {pulse.windowTotal} events · {pulse.windowDays} days
                      </p>
                    </div>
                    <div className="mt-2.5">
                      <ActivitySparkline
                        data={pulse.dailyVolume}
                        label={`Workspace events per day, last ${pulse.windowDays} days`}
                      />
                    </div>
                  </div>
                ) : null}
                {pulse.activity.length > 0 ? (
                  <ol className="space-y-0.5">
                    {pulse.activity.slice(0, 7).map((entry, i) => (
                      <li
                        key={entry.id}
                        className="nk-rise flex items-start gap-3 py-1.5"
                        style={{ "--nk-stagger": String(i) } as CSSProperties}
                      >
                        <span className="mt-1.5 flex shrink-0 flex-col items-center">
                          <span
                            aria-hidden
                            className="h-1.5 w-1.5 rounded-full bg-accent"
                          />
                        </span>
                        <p className="min-w-0 flex-1 text-body-sm leading-snug text-text-secondary">
                          <span className="text-text-primary">
                            {entry.actorEmail
                              ? handleFromEmail(entry.actorEmail)
                              : "A member"}
                          </span>{" "}
                          {entry.verb}{" "}
                          <span className="font-medium text-text-primary">
                            {entry.kind.toLowerCase()}
                          </span>
                          <span className="ml-1.5 whitespace-nowrap text-caption text-text-muted">
                            {relativeTime(entry.occurredAt)}
                          </span>
                        </p>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="text-body-sm text-text-muted">
                    No recorded activity in the last two weeks.
                  </p>
                )}
              </Panel>
            ) : (
              <Panel tone="outlined" className="px-4 py-5">
                <p className="text-body-sm text-text-muted">
                  Activity history requires analytics access.
                </p>
              </Panel>
            )}
          </div>
        </section>
      </div>

      {/* ---- Continue working -------------------------------------------- */}
      {studio ? (
        <section aria-label="Continue working">
          <SectionHeader
            title="Continue working"
            description="Recently edited content across the workspace"
            action={<ViewAll href={`${base}/studio`}>Studio</ViewAll>}
          />
          {studio.recentLessons.length > 0 ? (
            <div className="mt-3 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {studio.recentLessons.slice(0, 6).map((lesson, i) => (
                <Link
                  key={lesson.id}
                  href={`${base}/courses/${lesson.courseId}/lessons/${lesson.id}`}
                  style={{ "--nk-stagger": String(i) } as CSSProperties}
                  className="nk-card nk-rise group flex flex-col justify-between gap-4 rounded-xl border border-border-subtle bg-surface-elevated p-4 shadow-raised"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-interactive text-text-muted transition-colors duration-[var(--motion-fast)] group-hover:text-accent">
                      <IconCourse size={16} />
                    </span>
                    <Badge
                      tone={
                        lesson.status === "published" ? "positive" : "neutral"
                      }
                    >
                      {lesson.status}
                    </Badge>
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-body-sm font-medium text-text-primary">
                      {lesson.title}
                    </p>
                    <p className="mt-0.5 text-caption text-text-muted">
                      Lesson · edited {relativeTime(lesson.updatedAt)}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <Panel tone="outlined" className="mt-3 px-4 py-5">
              <p className="text-body-sm text-text-muted">
                Nothing edited yet — Studio is where knowledge takes shape.
              </p>
            </Panel>
          )}
        </section>
      ) : null}

      {/* ---- Create ------------------------------------------------------- */}
      {createActions.length > 0 ? (
        <section aria-label="Create">
          <SectionHeader
            title="Create"
            description="Everything you have permission to start"
          />
          <div className="mt-3">
            <CreateActions actions={createActions} />
          </div>
        </section>
      ) : null}
    </div>
  );
}
