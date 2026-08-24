import { describe, expect, test } from "vitest";
import {
  hasOpenRemediation,
  outstandingPracticals,
  practicalRubricDefinitionSchema,
  practicalRubricRecordSchema,
  practicalStatus,
} from "./practical";
import { contentBlockSchema } from "./content-blocks";

const REQS = [
  {
    requirementId: "r1",
    lessonId: "l1",
    kind: "practical_sign_off",
    code: "PS-1",
    title: "Sign-Off 1",
  },
  {
    requirementId: "r2",
    lessonId: "l2",
    kind: "terminal_defense",
    code: "T-01",
    title: "Defense",
  },
] as const;

describe("practical status derivation", () => {
  test("no evaluations → not evaluated, everything outstanding", () => {
    expect(practicalStatus("r1", [])).toBe("not_evaluated");
    expect(outstandingPracticals(REQS, [])).toHaveLength(2);
    expect(hasOpenRemediation(REQS, [])).toBe(false);
  });

  test("a recorded pass stands and clears the requirement", () => {
    const evals = [
      { requirementId: "r1", result: "failed", evaluatedAt: "2026-08-01" },
      { requirementId: "r1", result: "passed", evaluatedAt: "2026-08-02" },
    ] as const;
    expect(practicalStatus("r1", evals)).toBe("passed");
    expect(
      outstandingPracticals(REQS, evals).map((r) => r.requirementId),
    ).toEqual(["r2"]);
  });

  test("latest evaluation speaks when there is no pass", () => {
    const evals = [
      { requirementId: "r2", result: "failed", evaluatedAt: "2026-08-01" },
      {
        requirementId: "r2",
        result: "remediation_required",
        evaluatedAt: "2026-08-03",
      },
    ] as const;
    expect(practicalStatus("r2", evals)).toBe("remediation_open");
    expect(hasOpenRemediation(REQS, evals)).toBe(true);
  });

  test("open remediation blocks (stays outstanding) until a pass is recorded", () => {
    const open = [
      {
        requirementId: "r2",
        result: "remediation_required",
        evaluatedAt: "2026-08-03",
      },
    ] as const;
    expect(
      outstandingPracticals(REQS, open).some((r) => r.requirementId === "r2"),
    ).toBe(true);
    const closed = [
      ...open,
      { requirementId: "r2", result: "passed", evaluatedAt: "2026-08-05" },
    ] as const;
    expect(practicalStatus("r2", closed)).toBe("passed");
    expect(hasOpenRemediation(REQS, closed)).toBe(false);
  });
});

describe("rubric schemas", () => {
  test("definition is strict and bounded", () => {
    expect(
      practicalRubricDefinitionSchema.parse({
        dimensions: ["model fluency", "evidence honesty"],
        scale: "0-3",
        pass: "11/15, no dimension below 2, never 0 on evidence honesty",
      }).dimensions,
    ).toHaveLength(2);
    expect(() =>
      practicalRubricDefinitionSchema.parse({ dimensions: [], extra: true }),
    ).toThrow();
  });

  test("recorded scores are human-entered numbers with optional notes", () => {
    const parsed = practicalRubricRecordSchema.parse({
      scores: [{ dimension: "evidence honesty", score: 3 }],
      summary: "Defended population-transfer disclosure without prompting.",
    });
    expect(parsed.scores?.[0]?.score).toBe(3);
    expect(() =>
      practicalRubricRecordSchema.parse({
        scores: [{ dimension: "x", score: -1 }],
      }),
    ).toThrow();
  });
});

describe("lesson_reference block", () => {
  test("validates strictly and rejects extra keys", () => {
    const block = contentBlockSchema.parse({
      id: "00000000-0000-4000-8000-000000000001",
      type: "lesson_reference",
      schemaVersion: 1,
      position: "a0",
      data: {
        courseId: "00000000-0000-4000-8000-000000000002",
        lessonId: "00000000-0000-4000-8000-000000000003",
        label: "Recall — Evidence classes (G3 101, M12)",
      },
    });
    expect(block.type).toBe("lesson_reference");
    expect(() =>
      contentBlockSchema.parse({
        id: "00000000-0000-4000-8000-000000000001",
        type: "lesson_reference",
        schemaVersion: 1,
        position: "a0",
        data: {
          courseId: "00000000-0000-4000-8000-000000000002",
          lessonId: "00000000-0000-4000-8000-000000000003",
          label: "x",
          variant: "smuggled",
        },
      }),
    ).toThrow();
  });
});
