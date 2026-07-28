import { z } from "zod";

/**
 * Rule condition trees (rules-engine.md §1, ADR-009).
 *
 * Prototype proving:
 * - the typed tree shape (and/or/not groups over discriminated leaves)
 * - depth/leaf limits enforced by validation
 * - the Phase 1C `prerequisites` subset is expressible in the tree,
 *   making the Phase 3 migration mechanical.
 *
 * Only the `node_completed` leaf exists here; Phase 3 adds types additively.
 */

export const MAX_TREE_DEPTH = 5;
export const MAX_TREE_LEAVES = 50;

const nodeCompletedCondition = z.object({
  kind: z.literal("condition"),
  type: z.literal("node_completed"),
  schemaVersion: z.literal(1),
  params: z.object({ pathNodeId: z.uuid() }),
});

export type ConditionLeaf = z.infer<typeof nodeCompletedCondition>;

export type ConditionNode =
  | { kind: "group"; op: "and" | "or"; children: ConditionNode[] }
  | { kind: "not"; child: ConditionNode }
  | ConditionLeaf;

export const conditionNodeSchema: z.ZodType<ConditionNode> = z.lazy(() =>
  z.union([
    z.object({
      kind: z.literal("group"),
      op: z.enum(["and", "or"]),
      children: z.array(conditionNodeSchema).min(1),
    }),
    z.object({ kind: z.literal("not"), child: conditionNodeSchema }),
    nodeCompletedCondition,
  ]),
);

export function treeStats(node: ConditionNode): {
  depth: number;
  leaves: number;
} {
  if (node.kind === "condition") return { depth: 1, leaves: 1 };
  const children = node.kind === "group" ? node.children : [node.child];
  const stats = children.map(treeStats);
  return {
    depth: 1 + Math.max(...stats.map((s) => s.depth)),
    leaves: stats.reduce((sum, s) => sum + s.leaves, 0),
  };
}

export function validateConditionTree(
  input: unknown,
): { ok: true; tree: ConditionNode } | { ok: false; error: string } {
  const parsed = conditionNodeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.message };
  const { depth, leaves } = treeStats(parsed.data);
  if (depth > MAX_TREE_DEPTH)
    return {
      ok: false,
      error: `tree depth ${depth} exceeds ${MAX_TREE_DEPTH}`,
    };
  if (leaves > MAX_TREE_LEAVES)
    return {
      ok: false,
      error: `tree has ${leaves} leaves, max ${MAX_TREE_LEAVES}`,
    };
  return { ok: true, tree: parsed.data };
}

/**
 * Phase 1C → Phase 3 migration claim, executable:
 * a set of prerequisite edges is exactly an AND group of node_completed leaves.
 */
export function prerequisitesToConditionTree(
  requiredNodeIds: string[],
): ConditionNode {
  return {
    kind: "group",
    op: "and",
    children: requiredNodeIds.map((pathNodeId) => ({
      kind: "condition",
      type: "node_completed",
      schemaVersion: 1,
      params: { pathNodeId },
    })),
  };
}

/** Pure evaluation core over completed-node context (rules-engine.md §2). */
export function evaluate(
  node: ConditionNode,
  completedNodeIds: ReadonlySet<string>,
): boolean {
  switch (node.kind) {
    case "condition":
      return completedNodeIds.has(node.params.pathNodeId);
    case "not":
      return !evaluate(node.child, completedNodeIds);
    case "group": {
      const results = node.children.map((c) => evaluate(c, completedNodeIds));
      return node.op === "and" ? results.every(Boolean) : results.some(Boolean);
    }
  }
}
