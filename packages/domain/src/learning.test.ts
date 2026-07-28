import { describe, expect, test } from "vitest";
import {
  completionRuleSchema,
  computeLessonAccess,
  computePathAccess,
  courseStructureSchema,
  eventEnvelopeSchema,
  isCourseComplete,
  wouldCreateCycle,
  type CourseStructure,
} from "./learning";
import { validateBlockData } from "./content-blocks";

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const structure: CourseStructure = {
  schemaVersion: 1,
  modules: [
    {
      moduleId: id(1),
      title: "Module One",
      position: "a0",
      lessons: [
        {
          lessonId: id(11),
          lessonVersionId: id(111),
          versionNumber: 1,
          title: "Lesson One",
          position: "a0",
          required: true,
        },
        {
          lessonId: id(12),
          lessonVersionId: id(112),
          versionNumber: 1,
          title: "Optional Interlude",
          position: "a1",
          required: false,
        },
      ],
    },
    {
      moduleId: id(2),
      title: "Module Two",
      position: "a1",
      lessons: [
        {
          lessonId: id(21),
          lessonVersionId: id(121),
          versionNumber: 2,
          title: "Lesson Two",
          position: "a0",
          required: true,
        },
      ],
    },
  ],
};

describe("course structure snapshot schema", () => {
  test("accepts a valid pinned structure and rejects unknown keys", () => {
    expect(courseStructureSchema.safeParse(structure).success).toBe(true);
    expect(
      courseStructureSchema.safeParse({ ...structure, extra: true }).success,
    ).toBe(false);
  });

  test("every lesson entry must pin an exact version id", () => {
    const broken = structuredClone(structure) as unknown as {
      modules: { lessons: Record<string, unknown>[] }[];
    };
    delete broken.modules[0]!.lessons[0]!["lessonVersionId"];
    expect(courseStructureSchema.safeParse(broken).success).toBe(false);
  });
});

describe("unlock computation (single source of truth)", () => {
  test("first required lesson available, later required lessons sequence-locked", () => {
    const access = computeLessonAccess({
      enrollmentStatus: "active",
      structure,
      progress: [],
    });
    expect(access[0]).toMatchObject({ lessonId: id(11), state: "available" });
    // optional lesson does not block; it is also locked behind the first
    // unfinished REQUIRED lesson? No: only required lessons block.
    expect(access[1]).toMatchObject({
      lessonId: id(12),
      state: "locked_by_sequence",
    });
    expect(access[2]).toMatchObject({
      lessonId: id(21),
      state: "locked_by_sequence",
      reason: 'Complete "Lesson One" first.',
    });
  });

  test("completing the blocking lesson unlocks the next", () => {
    const access = computeLessonAccess({
      enrollmentStatus: "active",
      structure,
      progress: [{ lessonId: id(11), status: "completed" }],
    });
    expect(access[0]!.state).toBe("completed");
    expect(access[1]!.state).toBe("available"); // optional
    expect(access[2]!.state).toBe("available");
  });

  test("optional lessons never block later content", () => {
    const access = computeLessonAccess({
      enrollmentStatus: "active",
      structure,
      progress: [{ lessonId: id(11), status: "exempted" }],
    });
    expect(access[2]!.state).toBe("available"); // optional id(12) untouched
  });

  test("inactive enrollments lock everything with an explanation", () => {
    const access = computeLessonAccess({
      enrollmentStatus: "withdrawn",
      structure,
      progress: [{ lessonId: id(11), status: "completed" }],
    });
    for (const a of access) {
      expect(a.state).toBe("not_enrolled");
      expect(a.reason).toMatch(/no longer active/);
    }
  });
});

describe("completion computation (bounded rules)", () => {
  const done = [
    { lessonId: id(11), status: "completed" as const },
    { lessonId: id(21), status: "completed" as const },
  ];

  test("all_required_lessons ignores optional lessons", () => {
    expect(
      isCourseComplete({
        structure,
        rule: { schemaVersion: 1, type: "all_required_lessons" },
        progress: done,
      }),
    ).toBe(true);
    expect(
      isCourseComplete({
        structure,
        rule: { schemaVersion: 1, type: "all_required_lessons" },
        progress: [done[0]!],
      }),
    ).toBe(false);
  });

  test("percentage rule and exemptions count as satisfied", () => {
    expect(
      isCourseComplete({
        structure,
        rule: {
          schemaVersion: 1,
          type: "percentage_of_required_lessons",
          percent: 50,
        },
        progress: [{ lessonId: id(21), status: "exempted" }],
      }),
    ).toBe(true);
  });

  test("rule schema rejects unbounded input", () => {
    expect(
      completionRuleSchema.safeParse({
        schemaVersion: 1,
        type: "custom_sql",
        sql: "…",
      }).success,
    ).toBe(false);
    expect(
      completionRuleSchema.safeParse({
        schemaVersion: 1,
        type: "percentage_of_required_lessons",
        percent: 200,
      }).success,
    ).toBe(false);
  });
});

describe("path access + prerequisite cycles", () => {
  const nodes = [
    { nodeId: id(31), courseId: id(41), title: "Foundations", position: "a0" },
    { nodeId: id(32), courseId: id(42), title: "Advanced", position: "a1" },
    { nodeId: id(33), courseId: id(43), title: "Capstone", position: "a2" },
  ];
  const edges = [
    { nodeId: id(32), requiresNodeId: id(31) },
    { nodeId: id(33), requiresNodeId: id(32) },
  ];

  test("prerequisite gating with explainable reasons", () => {
    const access = computePathAccess({
      enrollmentStatus: "active",
      nodes,
      prerequisites: edges,
      completedCourseIds: [],
    });
    expect(access[0]!.state).toBe("available");
    expect(access[1]).toMatchObject({
      state: "locked_by_prerequisite",
      reason: "Complete Foundations first.",
    });
    const after = computePathAccess({
      enrollmentStatus: "active",
      nodes,
      prerequisites: edges,
      completedCourseIds: [id(41)],
    });
    expect(after[1]!.state).toBe("available");
    expect(after[2]!.state).toBe("locked_by_prerequisite");
  });

  test("cycle detection: self, direct, indirect, and valid DAG", () => {
    expect(
      wouldCreateCycle([], { nodeId: id(31), requiresNodeId: id(31) }),
    ).toBe(true); // self
    expect(
      wouldCreateCycle(edges, { nodeId: id(31), requiresNodeId: id(32) }),
    ).toBe(true); // direct back-edge
    expect(
      wouldCreateCycle(edges, { nodeId: id(31), requiresNodeId: id(33) }),
    ).toBe(true); // indirect (33 → 32 → 31)
    expect(
      wouldCreateCycle(edges, { nodeId: id(33), requiresNodeId: id(31) }),
    ).toBe(false); // redundant but acyclic
  });
});

describe("event envelope + new blocks", () => {
  test("envelope is strict, versioned, and tenant-scoped", () => {
    const valid = {
      id: id(90),
      v: 1,
      type: "learning.lesson.completed",
      organization_id: id(91),
      occurred_at: new Date().toISOString(),
      actor_user_id: id(92),
      subject_kind: "lesson",
      subject_id: id(93),
      context: { lesson_version_id: id(94), course_version_id: id(95) },
      data: {},
      correlation_id: null,
      causation_id: null,
    };
    expect(eventEnvelopeSchema.safeParse(valid).success).toBe(true);
    expect(
      eventEnvelopeSchema.safeParse({ ...valid, type: "made.up.event" })
        .success,
    ).toBe(false);
    expect(
      eventEnvelopeSchema.safeParse({ ...valid, organization_id: undefined })
        .success,
    ).toBe(false);
    expect(
      eventEnvelopeSchema.safeParse({
        ...valid,
        data: { nested: { deep: true } },
      }).success,
    ).toBe(false); // payloads stay flat and bounded
  });

  test("1C blocks validate; unsafe payloads rejected", () => {
    expect(
      validateBlockData("rich_text", 1, { text: "Hello **world**" }).ok,
    ).toBe(true);
    expect(
      validateBlockData("video", 1, {
        url: "https://example.com/v",
        title: "Intro",
      }).ok,
    ).toBe(true);
    expect(
      validateBlockData("video", 1, { url: "javascript:alert(1)", title: "x" })
        .ok,
    ).toBe(false);
    expect(
      validateBlockData("video", 1, {
        url: "http://insecure.example/v",
        title: "x",
      }).ok,
    ).toBe(false);
    expect(
      validateBlockData("file_link", 1, {
        label: "Both",
        assetId: id(1),
        url: "https://x.example/f",
      }).ok,
    ).toBe(false); // exactly one source
    expect(
      validateBlockData("rich_text", 1, { text: "hi", html: "<script>" }).ok,
    ).toBe(false); // strict: unknown keys rejected
    expect(validateBlockData("divider", 1, {}).ok).toBe(true);
    expect(
      validateBlockData("checklist", 1, {
        items: [{ id: id(5), text: "Do the thing" }],
      }).ok,
    ).toBe(true);
  });
});
