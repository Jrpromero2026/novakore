import { describe, expect, test } from "vitest";
import {
  canTransitionReviewRequest,
  describePrerequisites,
  diffBlockSets,
  pathLayoutSchema,
  validatePathGraph,
} from "./studio";
import {
  BLOCK_STATUS,
  BLOCK_TYPES,
  contentBlockSchema,
} from "./content-blocks";

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

describe("path graph validation", () => {
  const nodes = (...ids: string[]) =>
    ids.map((nodeId, i) => ({ nodeId, position: `a${i}` }));

  test("a clean linear path validates with one start node", () => {
    const report = validatePathGraph({
      nodes: nodes(id(1), id(2), id(3)),
      prerequisites: [
        { nodeId: id(2), requiresNodeId: id(1) },
        { nodeId: id(3), requiresNodeId: id(2) },
      ],
    });
    expect(report.ok).toBe(true);
    expect(report.startNodeIds).toEqual([id(1)]);
    expect(report.cycleNodeIds).toEqual([]);
    expect(report.unreachableNodeIds).toEqual([]);
    expect(report.orphanNodeIds).toEqual([]);
  });

  test("cycles are detected and poison reachability", () => {
    const report = validatePathGraph({
      nodes: nodes(id(1), id(2), id(3)),
      prerequisites: [
        { nodeId: id(1), requiresNodeId: id(2) },
        { nodeId: id(2), requiresNodeId: id(1) },
        { nodeId: id(3), requiresNodeId: id(1) },
      ],
    });
    expect(report.ok).toBe(false);
    expect(report.cycleNodeIds.sort()).toEqual([id(1), id(2)].sort());
    // 3 depends on the cycle → also unreachable
    expect(report.unreachableNodeIds).toContain(id(3));
  });

  test("orphans are isolated nodes in a multi-node graph", () => {
    const report = validatePathGraph({
      nodes: nodes(id(1), id(2), id(3)),
      prerequisites: [{ nodeId: id(2), requiresNodeId: id(1) }],
    });
    expect(report.orphanNodeIds).toEqual([id(3)]);
    expect(report.ok).toBe(true); // orphan is a warning, not a failure
  });

  test("edges referencing unknown nodes are invalid", () => {
    const report = validatePathGraph({
      nodes: nodes(id(1)),
      prerequisites: [{ nodeId: id(1), requiresNodeId: id(99) }],
    });
    expect(report.ok).toBe(false);
    expect(report.invalidEdges).toHaveLength(1);
  });

  test("prerequisite descriptions read like sentences", () => {
    const titles = new Map([
      [id(1), "Foundations"],
      [id(2), "Advanced"],
    ]);
    expect(
      describePrerequisites({
        titlesById: titles,
        requires: [],
        required: true,
      }),
    ).toBe("Available from the start");
    expect(
      describePrerequisites({
        titlesById: titles,
        requires: [id(1), id(2)],
        required: false,
      }),
    ).toBe("Unlocks after completing “Foundations” and “Advanced” · optional");
  });
});

describe("structured block diff", () => {
  const block = (n: number, position: string, text: string) => ({
    id: id(n),
    type: "rich_text",
    position,
    data: { text },
  });

  test("added, removed, moved, and changed are distinguished", () => {
    const before = [
      block(1, "a0", "one"),
      block(2, "a1", "two"),
      block(3, "a2", "three"),
    ];
    const after = [
      block(2, "a0", "two"), // moved (order changed only)
      block(1, "a1", "one edited"), // moved + changed
      block(4, "a2", "four"), // added
      // 3 removed
    ];
    const diff = diffBlockSets(before, after);
    expect(diff.added).toBe(1);
    expect(diff.removed).toBe(1);
    expect(diff.moved).toBe(2);
    expect(diff.changed).toBe(1);
    expect(diff.entries.find((e) => e.id === id(1))?.change).toBe(
      "moved_and_changed",
    );
  });

  test("key order never produces false positives", () => {
    const before = [
      { id: id(1), type: "rich_text", position: "a0", data: { a: 1, b: 2 } },
    ];
    const after = [
      { id: id(1), type: "rich_text", position: "a0", data: { b: 2, a: 1 } },
    ];
    const diff = diffBlockSets(before, after);
    expect(diff.changed).toBe(0);
    expect(diff.unchanged).toBe(1);
  });
});

describe("review request state machine", () => {
  test("transitions are minimal and terminal", () => {
    expect(canTransitionReviewRequest("open", "approved")).toBe(true);
    expect(canTransitionReviewRequest("open", "changes_requested")).toBe(true);
    expect(canTransitionReviewRequest("changes_requested", "open")).toBe(true);
    expect(canTransitionReviewRequest("approved", "open")).toBe(false);
    expect(canTransitionReviewRequest("closed", "open")).toBe(false);
  });
});

describe("path layout schema", () => {
  test("layout is bounded presentation data", () => {
    const layout = pathLayoutSchema.parse({
      schemaVersion: 1,
      positions: [{ nodeId: id(1), x: 120, y: -40 }],
    });
    expect(layout.positions).toHaveLength(1);
    expect(() =>
      pathLayoutSchema.parse({
        schemaVersion: 1,
        positions: [{ nodeId: id(1), x: 99_999, y: 0 }],
      }),
    ).toThrow();
  });
});

describe("phase 2 block catalog", () => {
  test("every block type has a classification and a valid v1 schema path", () => {
    for (const type of BLOCK_TYPES) {
      expect(BLOCK_STATUS[type]).toBeDefined();
    }
  });

  test("new interactive blocks validate strictly", () => {
    const flashcards = contentBlockSchema.parse({
      id: id(10),
      type: "flashcards",
      schemaVersion: 1,
      position: "a0",
      data: {
        cards: [{ id: id(11), front: "Term", back: "Definition" }],
      },
    });
    expect(flashcards.type).toBe("flashcards");

    expect(() =>
      contentBlockSchema.parse({
        id: id(12),
        type: "knowledge_check",
        schemaVersion: 1,
        position: "a1",
        data: {
          prompt: "Pick one",
          options: [
            { id: id(13), text: "A" },
            { id: id(14), text: "B" },
          ],
          correctOptionId: id(99), // not one of the options
        },
      }),
    ).toThrow(/must reference/);

    expect(() =>
      contentBlockSchema.parse({
        id: id(15),
        type: "tabs",
        schemaVersion: 1,
        position: "a2",
        data: { tabs: [{ id: id(16), title: "Only one", body: "x" }] },
      }),
    ).toThrow(); // tabs require ≥2
  });

  test("schema-only blocks validate but are marked as such", () => {
    const survey = contentBlockSchema.parse({
      id: id(20),
      type: "survey",
      schemaVersion: 1,
      position: "a0",
      data: {
        prompt: "Tell us how it went.",
        questions: [{ id: id(21), text: "What stood out?" }],
      },
    });
    expect(survey.type).toBe("survey");
    expect(BLOCK_STATUS.survey).toBe("schema_only");
    expect(BLOCK_STATUS.ai_conversation).toBe("schema_only");
  });
});
