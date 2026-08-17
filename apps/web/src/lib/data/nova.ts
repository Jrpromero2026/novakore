import "server-only";
import { cached, memberCacheKey } from "../cache";
import { supabaseServer } from "../supabase/server";
import { countContentWords } from "../lesson-health";
import {
  deriveInsights,
  deriveScorecard,
  type NovaDigestWindow,
  type NovaInputs,
  type NovaInsight,
  type ScoreDimension,
} from "../nova-insights";

/**
 * Nova intelligence data layer. Every row is read under the caller's RLS
 * session; learner signals are fetched ONLY when the caller holds
 * `analytics.view` (enforced at the call site via `includeLearner`). The
 * pure engine in lib/nova-insights.ts derives everything else — this module
 * fabricates nothing.
 */

export interface NovaReport {
  insights: NovaInsight[];
  scorecard: ScoreDimension[];
  digest: {
    thisWeek: NovaDigestWindow;
    lastWeek: NovaDigestWindow;
    openReviews: number;
  } | null;
  /** Real cumulative published lesson versions by ISO week (evolution). */
  evolution: { week: string; cumulative: number }[];
}

/** One pre-aggregated day/type bucket from `org_event_daily_by_type`. */
interface DayTypeRow {
  day: string;
  type: string;
  count: number;
}

/** One ranked drop-off row from `org_event_metrics`. */
interface DropOffRow {
  lesson_id: string;
  started: number;
  completed: number;
  gap: number;
}

/**
 * Digest window over pre-aggregated buckets. `from` is inclusive and `to`
 * exclusive on whole UTC days, matching the day granularity the aggregate
 * returns.
 */
function windowCounts(
  rows: DayTypeRow[],
  from: Date,
  to: Date,
): NovaDigestWindow {
  const fromDay = from.toISOString().slice(0, 10);
  const toDay = to.toISOString().slice(0, 10);
  const inWindow = rows.filter((r) => r.day >= fromDay && r.day < toDay);
  const count = (type: string) =>
    inWindow
      .filter((r) => r.type === type)
      .reduce((sum, r) => sum + r.count, 0);
  return {
    lessonsPublished: count("content.lesson.published"),
    journeysCompleted: count("learning.path.completed"),
    evaluationsPassed: count("assessment.attempt.passed"),
    evaluationsFailed: count("assessment.attempt.failed"),
    enrollments: count("enrollment.learner.enrolled"),
  };
}

/**
 * Cached entry point for the Nova report.
 *
 * The report costs 14 concurrent queries, and both surfaces that render it
 * (`/admin/intelligence` and `/admin/organization`) pay that in full on
 * every visit and every reload.
 *
 * WHY THIS ENTRY IS KEYED PER MEMBER AND NOT PER ORGANIZATION
 * -----------------------------------------------------------
 * Most of the tables Nova reads reduce to org-wide `content.view_draft`, so
 * an org-keyed entry looks tempting. Three do not:
 *
 *   enrollments               enrollment.manage OR progress.view.others
 *                             OR the row's membership is mine
 *   assessment_attempts       assessment.grade OR progress.view.others
 *                             OR the row's membership is mine
 *   organization_memberships  org.members.manage OR the row is mine
 *
 * Two consequences, both of which rule out an org-wide key. First, a caller
 * holding `org.members.manage` would populate the entry with organization-
 * wide rows that a plain content author — who also holds `content.view_draft`
 * and so would hit the same entry — must not see. Second, the "or the row is
 * mine" clauses mean that even two callers with *identical* permissions see
 * different rows, so a permission-set key would not be sufficient either.
 *
 * Keying on membership makes reuse impossible across users by construction.
 * The hit rate is correspondingly narrower — a member moving between the two
 * Nova surfaces, or reloading one — which is the honest trade for a report
 * whose contents are genuinely per-caller.
 *
 * `includeLearner` is a separate variant because it changes which queries
 * run at all.
 */
export async function getNovaReport(
  organizationId: string,
  orgSlug: string,
  {
    includeLearner = false,
    membershipId,
  }: { includeLearner?: boolean; membershipId?: string } = {},
): Promise<NovaReport> {
  // Without an identity there is no safe key, so skip the cache rather than
  // guess at one. Callers inside an org context always have a membership.
  if (!membershipId) {
    return loadNovaReport(organizationId, orgSlug, includeLearner);
  }
  return cached(
    memberCacheKey(
      "nova",
      organizationId,
      membershipId,
      includeLearner ? "learner" : "base",
    ),
    NOVA_TTL_MS,
    () => loadNovaReport(organizationId, orgSlug, includeLearner),
  );
}

/**
 * Nova's digest and scorecard are read as a considered summary rather than a
 * live ticker, so a minute of staleness is acceptable; authoring writes
 * invalidate the organization's entries anyway.
 */
const NOVA_TTL_MS = 60_000;

async function loadNovaReport(
  organizationId: string,
  orgSlug: string,
  includeLearner: boolean,
): Promise<NovaReport> {
  const supabase = await supabaseServer();
  const base = `/${orgSlug}/admin`;
  const now = new Date();
  const twoWeeksAgo = new Date(now.getTime() - 14 * 86400_000);

  const [
    { data: courses },
    { data: journeys },
    { data: nodes },
    { data: prereqs },
    { data: assignments },
    { data: lessons },
    { data: blocks },
    { data: reviewRows },
    { data: libraryBlocks },
    { data: libraryRefs },
    { data: courseVersions },
    { data: lessonVersions },
    { data: recentEvents },
    { data: terminology },
  ] = await Promise.all([
    supabase
      .from("courses")
      .select("id, title, current_published_version_id")
      .eq("organization_id", organizationId)
      .neq("status", "archived")
      .limit(200),
    supabase
      .from("learning_paths")
      .select("id, title")
      .eq("organization_id", organizationId)
      .neq("status", "archived")
      .limit(100),
    supabase
      .from("path_nodes")
      .select("id, path_id, course_id")
      .eq("organization_id", organizationId),
    supabase
      .from("prerequisites")
      .select("path_id, node_id, requires_node_id")
      .eq("organization_id", organizationId),
    supabase
      .from("assessment_assignments")
      .select("assessment_id, course_id")
      .eq("organization_id", organizationId)
      .eq("status", "active"),
    supabase
      .from("lessons")
      .select("id, course_id, title, current_published_version_id")
      .eq("organization_id", organizationId)
      .is("archived_at", null)
      .limit(500),
    supabase
      .from("content_blocks")
      .select("lesson_id, data")
      .eq("organization_id", organizationId)
      .limit(5000),
    supabase
      .from("review_requests")
      .select("subject_type, subject_id, status, created_at")
      .eq("organization_id", organizationId),
    supabase
      .from("reusable_blocks")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("status", "active"),
    supabase
      .from("content_blocks")
      .select("source_reusable_block_id")
      .eq("organization_id", organizationId)
      .not("source_reusable_block_id", "is", null),
    supabase
      .from("course_versions")
      .select("course_id, published_at")
      .eq("organization_id", organizationId)
      .order("published_at", { ascending: false })
      .limit(500),
    supabase
      .from("lesson_versions")
      .select("published_at")
      .eq("organization_id", organizationId)
      .order("published_at", { ascending: true })
      .limit(2000),
    // Windowed activity, pre-aggregated in Postgres (migration
    // 20260817040230): day/type counts + the distinct learning actors,
    // replacing a 5,000-row scan on every render.
    supabase.rpc("org_event_daily_by_type", {
      p_organization_id: organizationId,
      p_window_days: 14,
    }),
    supabase
      .from("organization_terminology")
      .select("term_key, singular")
      .eq("organization_id", organizationId),
  ]);

  // Pre-aggregated activity window (day/type buckets + distinct learning
  // actors). Empty when the caller lacks `analytics.view` — the function
  // returns `forbidden` and every downstream signal degrades to "no basis",
  // which is exactly how Nova is supposed to behave without evidence.
  const windowSeries = {
    rows: ((recentEvents as { rows?: DayTypeRow[] } | null)?.rows ??
      []) as DayTypeRow[],
    total: (recentEvents as { total?: number } | null)?.total ?? 0,
    learningActors: ((recentEvents as { learning_actors?: string[] } | null)
      ?.learning_actors ?? []) as string[],
  };

  // ---- Assemble pure-engine inputs from rows -------------------------------
  const courseTitle = new Map((courses ?? []).map((c) => [c.id, c.title]));
  const inJourney = new Set((nodes ?? []).map((n) => n.course_id));
  const assessmentsByCourse = new Map<string, number>();
  for (const a of assignments ?? []) {
    assessmentsByCourse.set(
      a.course_id,
      (assessmentsByCourse.get(a.course_id) ?? 0) + 1,
    );
  }
  const latestCoursePublish = new Map<string, string>();
  for (const v of courseVersions ?? []) {
    if (!latestCoursePublish.has(v.course_id)) {
      latestCoursePublish.set(v.course_id, v.published_at);
    }
  }
  const wordsByLesson = new Map<string, number>();
  for (const b of blocks ?? []) {
    wordsByLesson.set(
      b.lesson_id,
      (wordsByLesson.get(b.lesson_id) ?? 0) + countContentWords(b.data),
    );
  }
  const reviewedLessons = new Set(
    (reviewRows ?? [])
      .filter((r) => r.subject_type === "lesson")
      .map((r) => r.subject_id),
  );
  const openReviews = (reviewRows ?? []).filter(
    (r) => r.status === "open" || r.status === "changes_requested",
  ).length;
  const usedLibrary = new Set(
    (libraryRefs ?? []).map((r) => r.source_reusable_block_id),
  );
  const nodesByPath = new Map<string, Set<string>>();
  for (const n of nodes ?? []) {
    const set = nodesByPath.get(n.path_id) ?? new Set<string>();
    set.add(n.id);
    nodesByPath.set(n.path_id, set);
  }
  const publishedCourseIds = new Set(
    (courses ?? [])
      .filter((c) => c.current_published_version_id !== null)
      .map((c) => c.id),
  );
  const coursesByPath = new Map<string, string[]>();
  for (const n of nodes ?? []) {
    coursesByPath.set(n.path_id, [
      ...(coursesByPath.get(n.path_id) ?? []),
      n.course_id,
    ]);
  }

  // ---- Organizational awareness ---------------------------------------------
  // Terminology drift: draft prose using a canonical word the org renamed.
  const textOf = (value: unknown): string => {
    if (typeof value === "string") return value + " ";
    if (Array.isArray(value)) return value.map(textOf).join("");
    if (value !== null && typeof value === "object") {
      return Object.entries(value as Record<string, unknown>)
        .filter(([k]) => !(k === "id" || k.endsWith("Id") || k === "url"))
        .map(([, v]) => textOf(v))
        .join("");
    }
    return "";
  };
  const textByLesson = new Map<string, string>();
  for (const b of blocks ?? []) {
    textByLesson.set(
      b.lesson_id,
      (textByLesson.get(b.lesson_id) ?? "") + textOf(b.data).toLowerCase(),
    );
  }
  const CANONICAL_WORDS: Record<string, string> = {
    course: "course",
    module: "module",
    assessment: "assessment",
    certificate: "certificate",
    instructor: "instructor",
    learner: "learner",
    learning_path: "learning path",
  };
  let terminologyDrift: {
    canonical: string;
    replacement: string;
    lessonCount: number;
  } | null = null;
  for (const t of terminology ?? []) {
    const canonical = CANONICAL_WORDS[t.term_key];
    if (!canonical || t.singular.toLowerCase() === canonical) continue;
    const re = new RegExp(`\\b${canonical.replace(" ", "\\s+")}s?\\b`);
    let count = 0;
    for (const text of textByLesson.values()) if (re.test(text)) count += 1;
    if (count > (terminologyDrift?.lessonCount ?? 0)) {
      terminologyDrift = {
        canonical,
        replacement: t.singular,
        lessonCount: count,
      };
    }
  }

  // Contributor rhythm: the busiest weekday, only with a real basis.
  const WEEKDAYS = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  const byWeekday = new Array<number>(7).fill(0);
  for (const row of windowSeries.rows) {
    // `day` is a UTC calendar date from the aggregate; parse as UTC so the
    // weekday never shifts with the server's local timezone.
    byWeekday[new Date(`${row.day}T00:00:00Z`).getUTCDay()] += row.count;
  }
  const totalEvents = byWeekday.reduce((a, b) => a + b, 0);
  const topDay = byWeekday.indexOf(Math.max(...byWeekday));
  const weekdayPattern =
    totalEvents >= 30 && byWeekday[topDay]! / totalEvents >= 0.35
      ? {
          weekday: WEEKDAYS[topDay]!,
          sharePct: Math.round((byWeekday[topDay]! / totalEvents) * 100),
          totalEvents,
        }
      : null;

  // Oldest review still waiting.
  const openReviewDates = (reviewRows ?? [])
    .filter((r) => r.status === "open" || r.status === "changes_requested")
    .map((r) => new Date(r.created_at).getTime());
  const oldestOpenReviewDays =
    openReviewDates.length > 0
      ? Math.floor((now.getTime() - Math.min(...openReviewDates)) / 86400_000)
      : null;

  const inputs: NovaInputs = {
    courses: (courses ?? []).map((c) => ({
      id: c.id,
      title: c.title,
      published: c.current_published_version_id !== null,
      inJourney: inJourney.has(c.id),
      assessmentCount: assessmentsByCourse.get(c.id) ?? 0,
      freshDays: latestCoursePublish.has(c.id)
        ? Math.floor(
            (now.getTime() -
              new Date(latestCoursePublish.get(c.id)!).getTime()) /
              86400_000,
          )
        : null,
    })),
    journeys: (journeys ?? []).map((j) => {
      const courseIds = coursesByPath.get(j.id) ?? [];
      return {
        id: j.id,
        title: j.title,
        courseCount: courseIds.length,
        unpublishedCourseCount: courseIds.filter(
          (id) => !publishedCourseIds.has(id),
        ).length,
        hasAssessment: courseIds.some(
          (id) => (assessmentsByCourse.get(id) ?? 0) > 0,
        ),
        prerequisites: (prereqs ?? [])
          .filter((p) => p.path_id === j.id)
          .map((p) => ({
            nodeId: p.node_id,
            requiresNodeId: p.requires_node_id,
          })),
      };
    }),
    lessons: (lessons ?? []).map((l) => ({
      id: l.id,
      courseId: l.course_id,
      courseTitle: courseTitle.get(l.course_id) ?? "Course",
      title: l.title,
      words: wordsByLesson.get(l.id) ?? 0,
      published: l.current_published_version_id !== null,
      reviewed: reviewedLessons.has(l.id),
    })),
    unusedLibraryBlocks: (libraryBlocks ?? []).filter(
      (b) => !usedLibrary.has(b.id),
    ).length,
    openReviews,
    learner: null,
    digest: null,
    org: { terminologyDrift, weekdayPattern, oldestOpenReviewDays },
  };

  // ---- Learner signals (analytics.view holders only) ------------------------
  if (includeLearner) {
    const [
      { data: attempts },
      { data: enrollmentRows },
      { data: memberships },
      { data: eventMetrics },
    ] = await Promise.all([
      supabase
        .from("assessment_attempts")
        .select("assessment_id, status")
        .eq("organization_id", organizationId)
        .in("status", ["passed", "failed"])
        .limit(2000),
      supabase
        .from("enrollments")
        .select("membership_id, status")
        .eq("organization_id", organizationId),
      supabase
        .from("organization_memberships")
        .select("id, user_id")
        .eq("organization_id", organizationId),
      // All-time drop-off, aggregated in Postgres (migration 20260817040230).
      supabase.rpc("org_event_metrics", {
        p_organization_id: organizationId,
      }),
    ]);

    // Per-assessment difficulty from real graded attempts.
    const byAssessment = new Map<string, { passed: number; failed: number }>();
    for (const a of attempts ?? []) {
      const row = byAssessment.get(a.assessment_id) ?? { passed: 0, failed: 0 };
      if (a.status === "passed") row.passed += 1;
      else row.failed += 1;
      byAssessment.set(a.assessment_id, row);
    }
    const assessmentIds = [...byAssessment.keys()];
    const { data: assessmentTitles } = assessmentIds.length
      ? await supabase
          .from("assessments")
          .select("id, title")
          .in("id", assessmentIds)
      : { data: [] as { id: string; title: string }[] };
    const titleOf = new Map(
      (assessmentTitles ?? []).map((a) => [a.id, a.title]),
    );

    // Drop-off, already ranked by gap in the database (same aggregate the
    // ops surface uses, so both surfaces cannot disagree).
    const gaps = (
      ((eventMetrics as { drop_off?: DropOffRow[] } | null)?.drop_off ??
        []) as DropOffRow[]
    )
      .slice(0, 3)
      .map((g) => ({
        lessonId: g.lesson_id,
        started: g.started,
        completed: g.completed,
      }));
    const lessonTitle = new Map((lessons ?? []).map((l) => [l.id, l.title]));

    // Quiet enrollments: active enrollments whose member produced no
    // learning event inside the window.
    const userOfMembership = new Map(
      (memberships ?? []).map((m) => [m.id, m.user_id]),
    );
    const recentActors = new Set(windowSeries.learningActors);
    const activeEnrollments = (enrollmentRows ?? []).filter(
      (e) => e.status === "active",
    );
    const quiet = activeEnrollments.filter((e) => {
      const userId = userOfMembership.get(e.membership_id);
      return !userId || !recentActors.has(userId);
    }).length;

    const completedJourneys = (enrollmentRows ?? []).filter(
      (e) => e.status === "completed",
    ).length;

    inputs.learner = {
      dropOff: gaps.map((g) => ({
        title: lessonTitle.get(g.lessonId) ?? "(unknown lesson)",
        started: g.started,
        completed: g.completed,
      })),
      assessmentDifficulty: [...byAssessment.entries()].map(([id, row]) => ({
        title: titleOf.get(id) ?? "(unknown evaluation)",
        ...row,
      })),
      quietEnrollments: quiet,
      windowDays: 14,
      enrollments: (enrollmentRows ?? []).length,
      journeysCompleted: completedJourneys,
    };

    const weekAgo = new Date(now.getTime() - 7 * 86400_000);
    inputs.digest = {
      thisWeek: windowCounts(windowSeries.rows, weekAgo, now),
      lastWeek: windowCounts(windowSeries.rows, twoWeeksAgo, weekAgo),
    };
  }

  // ---- Knowledge evolution: cumulative published versions by week ----------
  const weekly = new Map<string, number>();
  for (const v of lessonVersions ?? []) {
    const d = new Date(v.published_at);
    // ISO-ish week key: Monday of that week.
    const day = (d.getUTCDay() + 6) % 7;
    const monday = new Date(d);
    monday.setUTCDate(d.getUTCDate() - day);
    const key = monday.toISOString().slice(0, 10);
    weekly.set(key, (weekly.get(key) ?? 0) + 1);
  }
  let running = 0;
  const evolution = [...weekly.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([week, count]) => {
      running += count;
      return { week, cumulative: running };
    });

  return {
    insights: deriveInsights(inputs, base),
    scorecard: deriveScorecard(inputs, base),
    digest: inputs.digest ? { ...inputs.digest, openReviews } : null,
    evolution,
  };
}
