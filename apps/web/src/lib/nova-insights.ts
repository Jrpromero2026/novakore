/**
 * Nova insight engine (Experience Design System — Nova Intelligence Layer).
 *
 * Pure derivation: rows in, grounded observations out. Every insight, score,
 * and digest line is computed from real platform records handed in by the
 * data layer — Nova never estimates, never extrapolates, never invents. A
 * signal that cannot be derived from the rows simply does not appear.
 */

export interface NovaCourse {
  id: string;
  title: string;
  published: boolean;
  inJourney: boolean;
  assessmentCount: number;
  /** Days since the most recent published version; null if never published. */
  freshDays: number | null;
}

export interface NovaJourney {
  id: string;
  title: string;
  courseCount: number;
  unpublishedCourseCount: number;
  /** Any active assessment attached to any of its courses. */
  hasAssessment: boolean;
  /** Prerequisite edges among this journey's nodes. */
  prerequisites: { nodeId: string; requiresNodeId: string }[];
}

export interface NovaLesson {
  id: string;
  courseId: string;
  courseTitle: string;
  title: string;
  words: number;
  published: boolean;
  reviewed: boolean;
}

export interface NovaLearnerSignals {
  dropOff: { title: string; started: number; completed: number }[];
  assessmentDifficulty: { title: string; passed: number; failed: number }[];
  /** Active enrollments with no learning event inside the window. */
  quietEnrollments: number;
  windowDays: number;
  enrollments: number;
  journeysCompleted: number;
}

export interface NovaDigestWindow {
  lessonsPublished: number;
  journeysCompleted: number;
  evaluationsPassed: number;
  evaluationsFailed: number;
  enrollments: number;
}

export interface NovaInputs {
  courses: NovaCourse[];
  journeys: NovaJourney[];
  lessons: NovaLesson[];
  unusedLibraryBlocks: number;
  openReviews: number;
  learner: NovaLearnerSignals | null;
  digest: { thisWeek: NovaDigestWindow; lastWeek: NovaDigestWindow } | null;
  /** Organizational awareness — null when the signal has no basis. */
  org?: {
    /** Draft prose using a canonical word the organization has renamed. */
    terminologyDrift: {
      canonical: string;
      replacement: string;
      lessonCount: number;
    } | null;
    /** Contributor rhythm: the busiest weekday across recent events. */
    weekdayPattern: {
      weekday: string;
      sharePct: number;
      totalEvents: number;
    } | null;
    /** Age in days of the oldest review still waiting on a decision. */
    oldestOpenReviewDays: number | null;
  };
}

export interface NovaInsight {
  id: string;
  tone: "danger" | "warning" | "accent" | "neutral" | "positive";
  observation: string;
  detail?: string;
  action?: { label: string; href: string };
}

export interface ScoreDimension {
  key: string;
  label: string;
  /** Honest ratio: n of m. pct is null when m is 0 (no basis, no score). */
  n: number;
  m: number;
  pct: number | null;
  explain: string;
  href?: string;
}

/** Detect a cycle in prerequisite edges (DFS, iterative). */
export function hasCycle(
  edges: { nodeId: string; requiresNodeId: string }[],
): boolean {
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    adj.set(e.requiresNodeId, [...(adj.get(e.requiresNodeId) ?? []), e.nodeId]);
  }
  const state = new Map<string, 1 | 2>(); // 1 visiting, 2 done
  for (const start of adj.keys()) {
    if (state.get(start)) continue;
    const stack: [string, number][] = [[start, 0]];
    state.set(start, 1);
    while (stack.length > 0) {
      const top = stack[stack.length - 1]!;
      const next = (adj.get(top[0]) ?? [])[top[1]];
      if (next === undefined) {
        state.set(top[0], 2);
        stack.pop();
        continue;
      }
      top[1] += 1;
      const s = state.get(next);
      if (s === 1) return true;
      if (!s) {
        state.set(next, 1);
        stack.push([next, 0]);
      }
    }
  }
  return false;
}

const pct = (n: number, m: number): number | null =>
  m === 0 ? null : Math.round((n / m) * 100);

export function deriveScorecard(
  inputs: NovaInputs,
  base: string,
): ScoreDimension[] {
  const { courses, journeys, lessons, learner } = inputs;
  const publishedCourses = courses.filter((c) => c.published);
  const publishedLessons = lessons.filter((l) => l.published);
  const intactJourneys = journeys.filter(
    (j) =>
      j.courseCount > 0 &&
      j.unpublishedCourseCount === 0 &&
      !hasCycle(j.prerequisites),
  );
  const freshCourses = publishedCourses.filter(
    (c) => c.freshDays !== null && c.freshDays <= 90,
  );
  const reviewedLessons = publishedLessons.filter((l) => l.reviewed);

  const dims: ScoreDimension[] = [
    {
      key: "publishing",
      label: "Publishing health",
      n: publishedCourses.length,
      m: courses.length,
      pct: pct(publishedCourses.length, courses.length),
      explain: "Courses that are live for learners, out of all courses.",
      href: `${base}/courses`,
    },
    {
      key: "integrity",
      label: "Curriculum integrity",
      n: intactJourneys.length,
      m: journeys.length,
      pct: pct(intactJourneys.length, journeys.length),
      explain:
        "Journeys whose courses are all published and whose prerequisites contain no cycles.",
      href: `${base}/learning`,
    },
    {
      key: "assessment",
      label: "Assessment coverage",
      n: publishedCourses.filter((c) => c.assessmentCount > 0).length,
      m: publishedCourses.length,
      pct: pct(
        publishedCourses.filter((c) => c.assessmentCount > 0).length,
        publishedCourses.length,
      ),
      explain: "Live courses with at least one attached evaluation.",
      href: `${base}/assessments`,
    },
    {
      key: "freshness",
      label: "Content freshness",
      n: freshCourses.length,
      m: publishedCourses.length,
      pct: pct(freshCourses.length, publishedCourses.length),
      explain: "Live courses republished within the last 90 days.",
      href: `${base}/courses`,
    },
    {
      key: "review",
      label: "Review coverage",
      n: reviewedLessons.length,
      m: publishedLessons.length,
      pct: pct(reviewedLessons.length, publishedLessons.length),
      explain:
        "Published lessons that went through at least one content review.",
      href: `${base}/studio/review`,
    },
  ];

  if (learner) {
    dims.push({
      key: "success",
      label: "Learner success",
      n: learner.journeysCompleted,
      m: learner.enrollments,
      pct: pct(learner.journeysCompleted, learner.enrollments),
      explain: "Journey completions out of all enrollments to date.",
      href: `${base}/ops`,
    });
  }
  return dims;
}

export function deriveInsights(
  inputs: NovaInputs,
  base: string,
): NovaInsight[] {
  const insights: NovaInsight[] = [];
  const { courses, journeys, lessons, learner } = inputs;

  // --- Curriculum structure -------------------------------------------------
  for (const j of journeys) {
    if (hasCycle(j.prerequisites)) {
      insights.push({
        id: `cycle-${j.id}`,
        tone: "danger",
        observation: `“${j.title}” has circular prerequisites — learners can be locked out.`,
        action: { label: "Open journey", href: `${base}/studio/paths/${j.id}` },
      });
    }
    if (j.courseCount > 0 && j.unpublishedCourseCount > 0) {
      insights.push({
        id: `broken-${j.id}`,
        tone: "warning",
        observation: `“${j.title}” contains ${j.unpublishedCourseCount} unpublished ${j.unpublishedCourseCount === 1 ? "course" : "courses"} — the pathway is incomplete for learners.`,
        action: { label: "Open journey", href: `${base}/studio/paths/${j.id}` },
      });
    }
    if (j.courseCount > 0 && !j.hasAssessment) {
      insights.push({
        id: `noassess-${j.id}`,
        tone: "warning",
        observation: `Nothing validates learning in “${j.title}” — no evaluation is attached anywhere along it.`,
        action: { label: "Attach one", href: `${base}/assessments` },
      });
    }
  }

  const isolated = courses.filter((c) => c.published && !c.inJourney);
  if (isolated.length > 0) {
    insights.push({
      id: "isolated",
      tone: "neutral",
      observation: `${isolated.length} published ${isolated.length === 1 ? "course sits" : "courses sit"} outside every journey — knowledge learners may never be routed to.`,
      detail: isolated
        .slice(0, 3)
        .map((c) => `“${c.title}”`)
        .join(", "),
      action: { label: "Review paths", href: `${base}/learning` },
    });
  }

  // Duplicate titles — a factual signal of possibly repeated material.
  const byTitle = new Map<string, NovaLesson[]>();
  for (const l of lessons) {
    const key = l.title.trim().toLowerCase();
    byTitle.set(key, [...(byTitle.get(key) ?? []), l]);
  }
  const dupes = [...byTitle.values()].filter((group) => group.length > 1);
  if (dupes.length > 0) {
    const g = dupes[0]!;
    insights.push({
      id: "dupes",
      tone: "neutral",
      observation: `${dupes.length} lesson ${dupes.length === 1 ? "title appears" : "titles appear"} more than once — possibly repeated material.`,
      detail: `e.g. “${g[0]!.title}” in ${g.map((l) => l.courseTitle).join(" and ")}`,
      action: { label: "Open Studio", href: `${base}/studio` },
    });
  }

  // Length consistency inside a course (real word counts).
  const byCourse = new Map<string, NovaLesson[]>();
  for (const l of lessons) {
    byCourse.set(l.courseId, [...(byCourse.get(l.courseId) ?? []), l]);
  }
  for (const [, group] of byCourse) {
    const sized = group.filter((l) => l.words > 0);
    if (sized.length < 3) continue;
    const min = sized.reduce((a, b) => (b.words < a.words ? b : a));
    const max = sized.reduce((a, b) => (b.words > a.words ? b : a));
    if (min.words > 0 && max.words / min.words >= 4) {
      insights.push({
        id: `length-${group[0]!.courseId}`,
        tone: "neutral",
        observation: `Lesson length swings widely in “${group[0]!.courseTitle}” — “${max.title}” (${max.words} words) vs “${min.title}” (${min.words}).`,
        action: {
          label: "Open course",
          href: `${base}/courses/${group[0]!.courseId}`,
        },
      });
      break; // one length insight is a nudge; ten is noise.
    }
  }

  if (inputs.unusedLibraryBlocks > 0) {
    insights.push({
      id: "library",
      tone: "neutral",
      observation: `${inputs.unusedLibraryBlocks} reusable ${inputs.unusedLibraryBlocks === 1 ? "block is" : "blocks are"} not used in any lesson.`,
      action: { label: "Open library", href: `${base}/studio/library` },
    });
  }
  if (inputs.openReviews > 0) {
    insights.push({
      id: "reviews",
      tone: "accent",
      observation: `${inputs.openReviews} content ${inputs.openReviews === 1 ? "review is" : "reviews are"} waiting on a decision.`,
      action: { label: "Review", href: `${base}/studio/review` },
    });
  }

  // --- Learner patterns (permission-gated by the caller) ---------------------
  if (learner) {
    const top = learner.dropOff[0];
    if (top && top.started >= 3) {
      insights.push({
        id: "dropoff",
        tone: "warning",
        observation: `Learners pause at “${top.title}” more than anywhere else — ${top.completed} of ${top.started} starts finished.`,
        action: { label: "Investigate", href: `${base}/ops` },
      });
    }
    const hard = learner.assessmentDifficulty.find(
      (a) => a.passed + a.failed >= 4 && a.failed > a.passed,
    );
    if (hard) {
      insights.push({
        id: "hard-assessment",
        tone: "warning",
        observation: `“${hard.title}” fails more attempts than it passes (${hard.failed} of ${hard.passed + hard.failed}).`,
        detail:
          "Harder than the rest — or measuring something the content doesn't teach yet.",
        action: { label: "Open evaluations", href: `${base}/assessments` },
      });
    }
    if (learner.quietEnrollments > 0) {
      insights.push({
        id: "stalled",
        tone: "neutral",
        observation: `${learner.quietEnrollments} active ${learner.quietEnrollments === 1 ? "enrollment shows" : "enrollments show"} no learning activity in the last ${learner.windowDays} days.`,
        action: { label: "Open analytics", href: `${base}/ops` },
      });
    }
  }

  // --- Organizational awareness ----------------------------------------------
  if (inputs.org?.terminologyDrift) {
    const t = inputs.org.terminologyDrift;
    insights.push({
      id: "terminology",
      tone: "neutral",
      observation: `${t.lessonCount} ${t.lessonCount === 1 ? "lesson says" : "lessons say"} “${t.canonical}” where your organization says “${t.replacement}”.`,
      detail: "Consistent language makes the workspace feel like yours.",
      action: { label: "Terminology", href: `${base}/terminology` },
    });
  }
  if (
    inputs.org?.oldestOpenReviewDays != null &&
    inputs.org.oldestOpenReviewDays >= 7
  ) {
    insights.push({
      id: "review-age",
      tone: "warning",
      observation: `A content review has been waiting ${inputs.org.oldestOpenReviewDays} days for a decision.`,
      action: { label: "Review", href: `${base}/studio/review` },
    });
  }
  if (inputs.org?.weekdayPattern) {
    const w = inputs.org.weekdayPattern;
    insights.push({
      id: "weekday",
      tone: "positive",
      observation: `Most activity lands on ${w.weekday}s — ${w.sharePct}% of the last ${w.totalEvents} events.`,
      detail: "A real rhythm worth planning releases around.",
    });
  }

  // --- Momentum (two real windows compared) ----------------------------------
  if (inputs.digest) {
    const { thisWeek, lastWeek } = inputs.digest;
    if (thisWeek.lessonsPublished < lastWeek.lessonsPublished) {
      insights.push({
        id: "velocity",
        tone: "neutral",
        observation: `Publishing slowed: ${thisWeek.lessonsPublished} ${thisWeek.lessonsPublished === 1 ? "lesson" : "lessons"} this week vs ${lastWeek.lessonsPublished} last week.`,
        action: { label: "Open Studio", href: `${base}/studio` },
      });
    }
  }

  const toneRank = {
    danger: 0,
    warning: 1,
    accent: 2,
    neutral: 3,
    positive: 4,
  };
  insights.sort((a, b) => toneRank[a.tone] - toneRank[b.tone]);

  if (insights.length === 0) {
    insights.push({
      id: "clear",
      tone: "positive",
      observation:
        "Nothing needs attention — structure, coverage, and activity all look healthy.",
    });
  }
  return insights;
}
