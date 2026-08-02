import "server-only";
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

function windowCounts(
  events: { type: string; occurred_at: string }[],
  from: Date,
  to: Date,
): NovaDigestWindow {
  const inWindow = events.filter((e) => {
    const t = new Date(e.occurred_at).getTime();
    return t >= from.getTime() && t < to.getTime();
  });
  const count = (type: string) =>
    inWindow.filter((e) => e.type === type).length;
  return {
    lessonsPublished: count("content.lesson.published"),
    journeysCompleted: count("learning.path.completed"),
    evaluationsPassed: count("assessment.attempt.passed"),
    evaluationsFailed: count("assessment.attempt.failed"),
    enrollments: count("enrollment.learner.enrolled"),
  };
}

export async function getNovaReport(
  organizationId: string,
  orgSlug: string,
  { includeLearner = false }: { includeLearner?: boolean } = {},
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
    supabase.from("content_blocks").select("lesson_id, data").limit(5000),
    supabase
      .from("review_requests")
      .select("subject_type, subject_id, status")
      .eq("organization_id", organizationId),
    supabase
      .from("reusable_blocks")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("status", "active"),
    supabase
      .from("content_blocks")
      .select("source_reusable_block_id")
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
      .order("published_at", { ascending: true })
      .limit(2000),
    supabase
      .from("analytics_events")
      .select("type, actor_user_id, occurred_at")
      .eq("organization_id", organizationId)
      .gte("occurred_at", twoWeeksAgo.toISOString())
      .limit(5000),
  ]);

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
  };

  // ---- Learner signals (analytics.view holders only) ------------------------
  if (includeLearner) {
    const events = recentEvents ?? [];
    const [
      { data: attempts },
      { data: enrollmentRows },
      { data: memberships },
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

    // Drop-off from the event log (same derivation the ops surface uses).
    const started = new Map<string, number>();
    const done = new Map<string, number>();
    // The 14-day event slice lacks subject ids; drop-off needs them — one
    // focused query over learning events only.
    const { data: learnEvents } = await supabase
      .from("analytics_events")
      .select("type, subject_id")
      .eq("organization_id", organizationId)
      .in("type", ["learning.lesson.started", "learning.lesson.completed"])
      .limit(5000);
    for (const e of learnEvents ?? []) {
      if (!e.subject_id) continue;
      if (e.type === "learning.lesson.started")
        started.set(e.subject_id, (started.get(e.subject_id) ?? 0) + 1);
      else done.set(e.subject_id, (done.get(e.subject_id) ?? 0) + 1);
    }
    const gaps = [...started.entries()]
      .map(([lessonId, s]) => ({
        lessonId,
        started: s,
        completed: done.get(lessonId) ?? 0,
      }))
      .filter((g) => g.started > g.completed)
      .sort((a, b) => b.started - b.completed - (a.started - a.completed))
      .slice(0, 3);
    const lessonTitle = new Map((lessons ?? []).map((l) => [l.id, l.title]));

    // Quiet enrollments: active enrollments whose member produced no
    // learning event inside the window.
    const userOfMembership = new Map(
      (memberships ?? []).map((m) => [m.id, m.user_id]),
    );
    const recentActors = new Set(
      events
        .filter((e) => e.type.startsWith("learning."))
        .map((e) => e.actor_user_id)
        .filter(Boolean),
    );
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
      thisWeek: windowCounts(events, weekAgo, now),
      lastWeek: windowCounts(events, twoWeeksAgo, weekAgo),
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
