import { describe, expect, test } from "vitest";
import {
  deriveInsights,
  deriveScorecard,
  hasCycle,
  type NovaInputs,
} from "./nova-insights";

const BASE = "/acme/admin";

const emptyInputs: NovaInputs = {
  courses: [],
  journeys: [],
  lessons: [],
  unusedLibraryBlocks: 0,
  openReviews: 0,
  learner: null,
  digest: null,
};

const course = (
  over: Partial<NovaInputs["courses"][number]> = {},
): NovaInputs["courses"][number] => ({
  id: "c1",
  title: "Course",
  published: true,
  inJourney: true,
  assessmentCount: 1,
  freshDays: 10,
  ...over,
});

const lesson = (
  over: Partial<NovaInputs["lessons"][number]> = {},
): NovaInputs["lessons"][number] => ({
  id: "l1",
  courseId: "c1",
  courseTitle: "Course",
  title: "Lesson",
  words: 300,
  published: true,
  reviewed: true,
  ...over,
});

describe("cycle detection", () => {
  test("no edges, no cycle", () => {
    expect(hasCycle([])).toBe(false);
  });
  test("a chain is not a cycle", () => {
    expect(
      hasCycle([
        { nodeId: "b", requiresNodeId: "a" },
        { nodeId: "c", requiresNodeId: "b" },
      ]),
    ).toBe(false);
  });
  test("a loop is a cycle", () => {
    expect(
      hasCycle([
        { nodeId: "b", requiresNodeId: "a" },
        { nodeId: "c", requiresNodeId: "b" },
        { nodeId: "a", requiresNodeId: "c" },
      ]),
    ).toBe(true);
  });
});

describe("scorecard", () => {
  test("scores are honest ratios; no basis means no score", () => {
    const dims = deriveScorecard(emptyInputs, BASE);
    for (const d of dims) {
      expect(d.pct).toBeNull();
      expect(d.m).toBe(0);
    }
  });

  test("ratios reflect the rows", () => {
    const dims = deriveScorecard(
      {
        ...emptyInputs,
        courses: [
          course(),
          course({ id: "c2", published: false, assessmentCount: 0 }),
        ],
        journeys: [
          {
            id: "j1",
            title: "J",
            courseCount: 2,
            unpublishedCourseCount: 0,
            hasAssessment: true,
            prerequisites: [],
          },
        ],
        lessons: [lesson(), lesson({ id: "l2", reviewed: false })],
      },
      BASE,
    );
    const by = new Map(dims.map((d) => [d.key, d]));
    expect(by.get("publishing")).toMatchObject({ n: 1, m: 2, pct: 50 });
    expect(by.get("integrity")).toMatchObject({ n: 1, m: 1, pct: 100 });
    expect(by.get("assessment")).toMatchObject({ n: 1, m: 1, pct: 100 });
    expect(by.get("review")).toMatchObject({ n: 1, m: 2, pct: 50 });
    // Learner dimension absent without learner signals — never invented.
    expect(by.has("success")).toBe(false);
  });
});

describe("insights", () => {
  test("healthy inputs produce the all-clear, nothing else", () => {
    const insights = deriveInsights(
      { ...emptyInputs, courses: [course()], lessons: [lesson()] },
      BASE,
    );
    expect(insights).toHaveLength(1);
    expect(insights[0]!.tone).toBe("positive");
  });

  test("circular prerequisites surface as danger, first", () => {
    const insights = deriveInsights(
      {
        ...emptyInputs,
        openReviews: 2,
        journeys: [
          {
            id: "j1",
            title: "Loop",
            courseCount: 2,
            unpublishedCourseCount: 0,
            hasAssessment: true,
            prerequisites: [
              { nodeId: "a", requiresNodeId: "b" },
              { nodeId: "b", requiresNodeId: "a" },
            ],
          },
        ],
      },
      BASE,
    );
    expect(insights[0]!.id).toBe("cycle-j1");
    expect(insights[0]!.tone).toBe("danger");
  });

  test("isolated published courses and duplicate titles are noticed", () => {
    const insights = deriveInsights(
      {
        ...emptyInputs,
        courses: [course({ inJourney: false })],
        lessons: [
          lesson({ id: "l1", title: "Warm-up", courseTitle: "A" }),
          lesson({
            id: "l2",
            courseId: "c2",
            title: "warm-up",
            courseTitle: "B",
          }),
        ],
      },
      BASE,
    );
    const ids = insights.map((i) => i.id);
    expect(ids).toContain("isolated");
    expect(ids).toContain("dupes");
  });

  test("learner signals appear only when provided, grounded in counts", () => {
    const insights = deriveInsights(
      {
        ...emptyInputs,
        courses: [course()],
        learner: {
          dropOff: [{ title: "Lesson 4", started: 6, completed: 1 }],
          assessmentDifficulty: [{ title: "Final", passed: 1, failed: 4 }],
          quietEnrollments: 3,
          windowDays: 14,
          enrollments: 10,
          journeysCompleted: 2,
        },
      },
      BASE,
    );
    const byId = new Map(insights.map((i) => [i.id, i]));
    expect(byId.get("dropoff")?.observation).toMatch(/1 of 6 starts/);
    expect(byId.get("hard-assessment")?.observation).toMatch(/4 of 5/);
    expect(byId.get("stalled")?.observation).toMatch(/3 active enrollments/);
  });

  test("organizational awareness is grounded and optional", () => {
    const insights = deriveInsights(
      {
        ...emptyInputs,
        courses: [course()],
        org: {
          terminologyDrift: {
            canonical: "course",
            replacement: "Program",
            lessonCount: 4,
          },
          weekdayPattern: { weekday: "Tuesday", sharePct: 42, totalEvents: 60 },
          oldestOpenReviewDays: 9,
        },
      },
      BASE,
    );
    const byId = new Map(insights.map((i) => [i.id, i]));
    expect(byId.get("terminology")?.observation).toMatch(
      /4 lessons say “course” where your organization says “Program”/,
    );
    expect(byId.get("review-age")?.observation).toMatch(/waiting 9 days/);
    expect(byId.get("weekday")?.observation).toMatch(
      /Tuesdays — 42% of the last 60/,
    );
  });

  test("a young open review does not nag", () => {
    const insights = deriveInsights(
      {
        ...emptyInputs,
        courses: [course()],
        org: {
          terminologyDrift: null,
          weekdayPattern: null,
          oldestOpenReviewDays: 2,
        },
      },
      BASE,
    );
    expect(insights.find((i) => i.id === "review-age")).toBeUndefined();
  });

  test("publishing slowdown compares two real windows", () => {
    const insights = deriveInsights(
      {
        ...emptyInputs,
        courses: [course()],
        digest: {
          thisWeek: {
            lessonsPublished: 2,
            journeysCompleted: 0,
            evaluationsPassed: 0,
            evaluationsFailed: 0,
            enrollments: 0,
          },
          lastWeek: {
            lessonsPublished: 5,
            journeysCompleted: 0,
            evaluationsPassed: 0,
            evaluationsFailed: 0,
            enrollments: 0,
          },
        },
      },
      BASE,
    );
    expect(insights.find((i) => i.id === "velocity")?.observation).toMatch(
      /2 lessons this week vs 5 last week/,
    );
  });
});
