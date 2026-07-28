import { describe, expect, test } from "vitest";
import {
  evaluate,
  prerequisitesToConditionTree,
  validateConditionTree,
  MAX_TREE_DEPTH,
  type ConditionNode,
} from "./rules";

const nodeA = "018f6d2e-7c4a-7000-8000-00000000000a";
const nodeB = "018f6d2e-7c4a-7000-8000-00000000000b";

const leaf = (pathNodeId: string): ConditionNode => ({
  kind: "condition",
  type: "node_completed",
  schemaVersion: 1,
  params: { pathNodeId },
});

describe("rule condition trees (ADR-009)", () => {
  test("Phase 1C prerequisites express as an AND tree — migration is mechanical", () => {
    const tree = prerequisitesToConditionTree([nodeA, nodeB]);
    expect(validateConditionTree(tree).ok).toBe(true);

    expect(evaluate(tree, new Set([nodeA, nodeB]))).toBe(true);
    expect(evaluate(tree, new Set([nodeA]))).toBe(false);
    expect(evaluate(tree, new Set())).toBe(false);
  });

  test("AND, OR, and NOT compose and evaluate correctly", () => {
    const tree: ConditionNode = {
      kind: "group",
      op: "or",
      children: [leaf(nodeA), { kind: "not", child: leaf(nodeB) }],
    };
    expect(evaluate(tree, new Set([nodeA, nodeB]))).toBe(true); // A done
    expect(evaluate(tree, new Set([nodeB]))).toBe(false); // only B done
    expect(evaluate(tree, new Set())).toBe(true); // NOT B holds
  });

  test("rejects malformed leaves — condition params are schema-validated", () => {
    const result = validateConditionTree({
      kind: "condition",
      type: "node_completed",
      schemaVersion: 1,
      params: { pathNodeId: "not-a-uuid" },
    });
    expect(result.ok).toBe(false);
  });

  test("enforces the depth cap", () => {
    let tree: ConditionNode = leaf(nodeA);
    for (let i = 0; i < MAX_TREE_DEPTH; i += 1) {
      tree = { kind: "not", child: tree };
    }
    const result = validateConditionTree(tree);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/depth/);
  });
});
