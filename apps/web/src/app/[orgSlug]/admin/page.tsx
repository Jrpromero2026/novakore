import type { Metadata } from "next";
import Link from "next/link";
import { can, requireOrgContext } from "@/lib/org-context";
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
  IconAi,
  IconAssessment,
  IconBranding,
  IconCourse,
  IconEnrollment,
  IconLibrary,
  IconPath,
  IconStudio,
} from "@/components/ui/icons";
import { Greeting } from "@/components/dashboard/greeting";
import {
  CreateActions,
  ListRows,
  Metric,
  ViewAll,
} from "@/components/dashboard/widgets";
import { ActivitySparkline, CompositionBar } from "@/components/dashboard/viz";

export const metadata: Metadata = { title: "Overview" };

export default async function OrgOverviewPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const ctx = await requireOrgContext(orgSlug);
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
    // Actor identities require the member directory permission as well.
    canAnalytics
      ? getWorkspacePulse(ctx.organization.id, {
          resolveActors: canMembers,
        })
      : Promise.resolve(null as WorkspacePulse | null),
    canStudio
      ? getContentComposition(ctx.organization.id)
      : Promise.resolve(null as ContentComposition | null),
  ]);

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

  // Attention queue — only genuinely actionable, real conditions.
  const attention: {
    key: string;
    title: string;
    meta: string;
    href: string;
    tone: "accent" | "warning" | "neutral";
  }[] = [];
  if (studio && studio.openReviews.length > 0) {
    attention.push({
      key: "reviews",
      title: `${studio.openReviews.length} content ${studio.openReviews.length === 1 ? "review" : "reviews"} awaiting a decision`,
      meta: "Studio · review queue",
      href: `${base}/studio/review`,
      tone: "accent",
    });
  }
  if (studio && studio.draftCourses.length > 0) {
    attention.push({
      key: "drafts",
      title: `${studio.draftCourses.length} ${studio.draftCourses.length === 1 ? "course" : "courses"} still in draft`,
      meta: "Not yet delivered to learners",
      href: `${base}/courses`,
      tone: "neutral",
    });
  }
  if (openFeedback !== null && openFeedback > 0) {
    attention.push({
      key: "feedback",
      title: `${openFeedback} open feedback ${openFeedback === 1 ? "item" : "items"}`,
      meta: "Analytics · feedback review",
      href: `${base}/ops`,
      tone: "warning",
    });
  }
  if (invitedMembers > 0) {
    attention.push({
      key: "invites",
      title: `${invitedMembers} pending ${invitedMembers === 1 ? "invitation" : "invitations"}`,
      meta: "Members have not accepted yet",
      href: `${base}/members`,
      tone: "neutral",
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

  const knowledgeAssets = studio
    ? studio.counts.courses +
      studio.counts.paths +
      studio.counts.assessments +
      studio.counts.libraryBlocks
    : null;

  return (
    <div className="space-y-10">
      {/* ---- Opening composition ---------------------------------------- */}
      <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
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
          <h1 className="mt-2 text-[1.75rem] font-semibold leading-tight tracking-tight text-text-primary">
            <Greeting name={handleFromEmail(user?.email)} />
          </h1>
          <p className="mt-1.5 max-w-xl text-body-sm leading-relaxed text-text-secondary">
            Build, govern, and deliver your organization&apos;s knowledge.
          </p>
        </div>
        {canStudio ? (
          <div className="flex flex-wrap items-center gap-2">
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
      </header>

      {/* ---- Operational spotlight + signals ----------------------------- */}
      <section
        aria-label="Workspace state"
        className="grid gap-2.5 lg:grid-cols-3"
      >
        <Panel tone="elevated" className="p-5 lg:col-span-2">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-title text-text-primary">
                Publishing readiness
              </h2>
              <p className="mt-0.5 text-caption text-text-muted">
                Course status across the workspace
              </p>
            </div>
            {canStudio ? <ViewAll href={`${base}/courses`} /> : null}
          </div>
          <div className="mt-5">
            {composition ? (
              <CompositionBar composition={composition} />
            ) : (
              <p className="text-body-sm text-text-muted">
                Publishing detail requires content access.
              </p>
            )}
          </div>
          {pulse ? (
            <div className="mt-6 border-t border-border-subtle pt-4">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-label font-medium text-text-secondary">
                  Workspace activity
                </h3>
                <p className="text-caption tabular-nums text-text-muted">
                  {pulse.windowTotal} events · last {pulse.windowDays} days
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
        </Panel>

        <Panel tone="outlined" className="divide-y divide-border-subtle p-1.5">
          {knowledgeAssets !== null ? (
            <Metric
              label="Knowledge assets"
              value={knowledgeAssets}
              emphasis
              href={`${base}/studio`}
              context={
                studio ? (
                  <span>
                    {studio.counts.courses} courses · {studio.counts.paths}{" "}
                    paths · {studio.counts.libraryBlocks} blocks
                  </span>
                ) : null
              }
            />
          ) : null}
          <Metric
            label={term("academy").plural}
            value={academyCount ?? 0}
            href={`${base}/academies`}
          />
          {activeMembers !== null ? (
            <Metric
              label="Members"
              value={activeMembers}
              href={`${base}/members`}
              context={
                invitedMembers > 0 ? (
                  <span>{invitedMembers} invited</span>
                ) : (
                  <span>all active</span>
                )
              }
            />
          ) : null}
        </Panel>
      </section>

      {/* ---- Learning signals (analytics holders only) -------------------- */}
      {ops ? (
        <section aria-label="Learning activity">
          <SectionHeader
            title="Learning activity"
            action={<ViewAll href={`${base}/ops`}>Analytics</ViewAll>}
          />
          <Panel
            tone="outlined"
            className="mt-2.5 grid grid-cols-2 divide-border-subtle p-1.5 sm:grid-cols-4 sm:divide-x"
          >
            <Metric
              label="Active learners"
              value={ops.activeLearners}
              context={<span>{ops.enrollments} enrollments</span>}
            />
            <Metric
              label="Lessons completed"
              value={ops.lessonsCompleted}
              context={<span>of {ops.lessonsStarted} started</span>}
            />
            <Metric
              label="Journeys completed"
              value={ops.journeysCompleted}
              context={<span>{ops.coursesCompleted} courses</span>}
            />
            <Metric
              label="Credentials issued"
              value={ops.credentialsIssued}
              href={`${base}/credentials`}
            />
          </Panel>
        </section>
      ) : null}

      {/* ---- Attention + activity ---------------------------------------- */}
      <div className="grid gap-x-6 gap-y-8 lg:grid-cols-2">
        <section aria-label="Needs attention">
          <SectionHeader title="Needs attention" count={attention.length} />
          <div className="mt-2.5">
            {attention.length === 0 ? (
              <Panel tone="outlined" className="px-4 py-5">
                <p className="flex items-center gap-2 text-body-sm text-text-secondary">
                  <StatusDot tone="positive" label="" />
                  Nothing is waiting on you — the queue is clear.
                </p>
              </Panel>
            ) : (
              <ul className="space-y-1.5">
                {attention.map((item) => (
                  <li key={item.key}>
                    <Link
                      href={item.href}
                      className="flex items-center gap-3 rounded-lg border border-border-subtle px-3.5 py-3 transition-colors duration-[var(--motion-fast)] hover:border-border-strong hover:bg-surface-interactive"
                    >
                      <span
                        aria-hidden
                        className={
                          item.tone === "accent"
                            ? "h-8 w-0.5 shrink-0 rounded-full bg-accent"
                            : item.tone === "warning"
                              ? "h-8 w-0.5 shrink-0 rounded-full bg-warning"
                              : "h-8 w-0.5 shrink-0 rounded-full bg-border-strong"
                        }
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-body-sm font-medium text-text-primary">
                          {item.title}
                        </span>
                        <span className="block truncate text-caption text-text-muted">
                          {item.meta}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section aria-label="Recent activity">
          <SectionHeader
            title="Recent activity"
            action={
              canAnalytics ? (
                <ViewAll href={`${base}/ops`}>Analytics</ViewAll>
              ) : undefined
            }
          />
          <div className="mt-2.5">
            {pulse ? (
              <Panel tone="outlined">
                <ListRows
                  emptyLabel="No recorded activity in the last two weeks."
                  rows={pulse.activity.slice(0, 7).map((entry) => ({
                    key: entry.id,
                    title: (
                      <>
                        <span className="text-text-secondary">
                          {entry.actorEmail ?? "A member"}
                        </span>{" "}
                        {entry.verb}{" "}
                        <span className="font-medium">
                          {entry.kind.toLowerCase()}
                        </span>
                      </>
                    ),
                    meta: relativeTime(entry.occurredAt),
                  }))}
                />
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
          <Panel tone="outlined" className="mt-2.5">
            <ListRows
              emptyLabel="Nothing edited yet — Studio is where knowledge takes shape."
              rows={studio.recentLessons.slice(0, 6).map((lesson) => ({
                key: lesson.id,
                title: lesson.title,
                meta: `Lesson · edited ${relativeTime(lesson.updatedAt)}`,
                badge: (
                  <Badge
                    tone={
                      lesson.status === "published" ? "positive" : "neutral"
                    }
                  >
                    {lesson.status}
                  </Badge>
                ),
                href: `${base}/courses/${lesson.courseId}/lessons/${lesson.id}`,
              }))}
            />
          </Panel>
        </section>
      ) : null}

      {/* ---- Create ------------------------------------------------------- */}
      {createActions.length > 0 ? (
        <section aria-label="Create">
          <SectionHeader
            title="Create"
            description="Everything you have permission to start"
          />
          <div className="mt-2.5">
            <CreateActions actions={createActions} />
          </div>
        </section>
      ) : null}
    </div>
  );
}
