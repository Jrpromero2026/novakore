import { z } from "zod";

/**
 * NovaKore Learning Studio domain (Phase 2).
 *
 * - Path graph validation: cycles, unreachable nodes, orphans, start nodes.
 *   The database trigger remains the cycle authority (1C); these pure
 *   functions power authoring feedback and the canvas — the visual layer
 *   is never the authority (ADR-020).
 * - Structured content diffing for the publish workflow (key-order
 *   independent — the 1C jsonb lesson applied).
 * - Review workflow state machine (collaboration foundations).
 * - Path canvas layout schema (presentation only, stored separately from
 *   semantic ordering).
 */

// ---------------------------------------------------------------------------
// Path graph validation
// ---------------------------------------------------------------------------

export interface PathGraphInput {
  nodes: { nodeId: string; position: string; required?: boolean }[];
  /** Edges: node → required node (completion prerequisites). */
  prerequisites: { nodeId: string; requiresNodeId: string }[];
}

export interface PathGraphReport {
  ok: boolean;
  /** Node ids participating in at least one cycle. */
  cycleNodeIds: string[];
  /** Nodes that can never unlock (prerequisite chain broken/circular). */
  unreachableNodeIds: string[];
  /** Nodes with no prerequisites and that nothing requires (isolated). */
  orphanNodeIds: string[];
  /** Nodes with no prerequisites — where a learner can begin. */
  startNodeIds: string[];
  /** Edges referencing node ids that do not exist. */
  invalidEdges: { nodeId: string; requiresNodeId: string }[];
}

export function validatePathGraph(input: PathGraphInput): PathGraphReport {
  const ids = new Set(input.nodes.map((n) => n.nodeId));
  const invalidEdges = input.prerequisites.filter(
    (e) => !ids.has(e.nodeId) || !ids.has(e.requiresNodeId),
  );
  const edges = input.prerequisites.filter(
    (e) => ids.has(e.nodeId) && ids.has(e.requiresNodeId),
  );

  const requires = new Map<string, string[]>();
  const requiredBy = new Map<string, string[]>();
  for (const e of edges) {
    requires.set(e.nodeId, [
      ...(requires.get(e.nodeId) ?? []),
      e.requiresNodeId,
    ]);
    requiredBy.set(e.requiresNodeId, [
      ...(requiredBy.get(e.requiresNodeId) ?? []),
      e.nodeId,
    ]);
  }

  // cycle detection: iterative DFS with colors over the "requires" edges
  const color = new Map<string, 0 | 1 | 2>();
  const inCycle = new Set<string>();
  const visit = (start: string) => {
    const stack: { id: string; next: number }[] = [{ id: start, next: 0 }];
    const trail: string[] = [start];
    color.set(start, 1);
    while (stack.length > 0) {
      const frame = stack[stack.length - 1]!;
      const targets = requires.get(frame.id) ?? [];
      if (frame.next < targets.length) {
        const target = targets[frame.next]!;
        frame.next += 1;
        const c = color.get(target) ?? 0;
        if (c === 0) {
          color.set(target, 1);
          stack.push({ id: target, next: 0 });
          trail.push(target);
        } else if (c === 1) {
          // back edge → everything from target on the trail is cyclic
          const from = trail.indexOf(target);
          for (const id of trail.slice(from)) inCycle.add(id);
        }
      } else {
        color.set(frame.id, 2);
        stack.pop();
        trail.pop();
      }
    }
  };
  for (const node of input.nodes) {
    if ((color.get(node.nodeId) ?? 0) === 0) visit(node.nodeId);
  }

  // reachability: a node is completable when all its prerequisites are
  // completable; cycles poison everything above them
  const completable = new Map<string, boolean>();
  const canComplete = (id: string, seen: Set<string>): boolean => {
    const cached = completable.get(id);
    if (cached !== undefined) return cached;
    if (seen.has(id) || inCycle.has(id)) return false;
    seen.add(id);
    const result = (requires.get(id) ?? []).every((req) =>
      canComplete(req, seen),
    );
    seen.delete(id);
    completable.set(id, result);
    return result;
  };
  const unreachableNodeIds = input.nodes
    .map((n) => n.nodeId)
    .filter((id) => !canComplete(id, new Set()));

  const startNodeIds = input.nodes
    .map((n) => n.nodeId)
    .filter((id) => (requires.get(id) ?? []).length === 0);
  const orphanNodeIds =
    input.nodes.length > 1
      ? startNodeIds.filter((id) => (requiredBy.get(id) ?? []).length === 0)
      : [];

  return {
    ok:
      inCycle.size === 0 &&
      unreachableNodeIds.length === 0 &&
      invalidEdges.length === 0,
    cycleNodeIds: [...inCycle].sort(),
    unreachableNodeIds,
    orphanNodeIds,
    startNodeIds,
    invalidEdges,
  };
}

/** Human-readable prerequisite summary for admin + learner explanations. */
export function describePrerequisites(input: {
  titlesById: Map<string, string>;
  requires: string[];
  required: boolean;
}): string {
  const names = input.requires
    .map((id) => `“${input.titlesById.get(id) ?? "another item"}”`)
    .join(" and ");
  const base =
    input.requires.length === 0
      ? "Available from the start"
      : `Unlocks after completing ${names}`;
  return input.required ? base : `${base} · optional`;
}

// ---------------------------------------------------------------------------
// Structured content diff (publish workflow)
// ---------------------------------------------------------------------------

const stableStringify = (value: unknown): string =>
  Array.isArray(value)
    ? `[${value.map(stableStringify).join(",")}]`
    : value !== null && typeof value === "object"
      ? `{${Object.entries(value as Record<string, unknown>)
          .sort(([a], [b]) => (a < b ? -1 : 1))
          .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`)
          .join(",")}}`
      : JSON.stringify(value);

export interface BlockDiffEntry {
  id: string;
  type: string;
  change: "added" | "removed" | "moved" | "changed" | "moved_and_changed";
}

export interface BlockSetDiff {
  entries: BlockDiffEntry[];
  added: number;
  removed: number;
  moved: number;
  changed: number;
  unchanged: number;
}

interface DiffableBlock {
  id: string;
  type: string;
  position: string;
  [key: string]: unknown;
}

/**
 * Diff two block arrays by stable id. "moved" = order changed only;
 * "changed" = content changed; key order never causes false positives.
 */
export function diffBlockSets(
  before: DiffableBlock[],
  after: DiffableBlock[],
): BlockSetDiff {
  const sortByPosition = (arr: DiffableBlock[]) =>
    [...arr].sort((a, b) => (a.position < b.position ? -1 : 1));
  const beforeSorted = sortByPosition(before);
  const afterSorted = sortByPosition(after);
  const beforeIndex = new Map(beforeSorted.map((b, i) => [b.id, i]));
  const afterIndex = new Map(afterSorted.map((b, i) => [b.id, i]));
  const beforeById = new Map(before.map((b) => [b.id, b]));

  const contentOf = (b: DiffableBlock) => {
    const rest: Record<string, unknown> = { ...b };
    delete rest.position; // ordering is the "moved" axis, not "changed"
    return stableStringify(rest);
  };

  const entries: BlockDiffEntry[] = [];
  let added = 0;
  let removed = 0;
  let moved = 0;
  let changed = 0;
  let unchanged = 0;

  for (const b of before) {
    if (!afterIndex.has(b.id)) {
      entries.push({ id: b.id, type: b.type, change: "removed" });
      removed += 1;
    }
  }
  for (const a of after) {
    const prior = beforeById.get(a.id);
    if (!prior) {
      entries.push({ id: a.id, type: a.type, change: "added" });
      added += 1;
      continue;
    }
    const contentChanged = contentOf(prior) !== contentOf(a);
    const orderChanged = beforeIndex.get(a.id) !== afterIndex.get(a.id);
    if (contentChanged && orderChanged) {
      entries.push({ id: a.id, type: a.type, change: "moved_and_changed" });
      moved += 1;
      changed += 1;
    } else if (contentChanged) {
      entries.push({ id: a.id, type: a.type, change: "changed" });
      changed += 1;
    } else if (orderChanged) {
      entries.push({ id: a.id, type: a.type, change: "moved" });
      moved += 1;
    } else {
      unchanged += 1;
    }
  }
  return { entries, added, removed, moved, changed, unchanged };
}

// ---------------------------------------------------------------------------
// Review workflow (collaboration foundations — no simultaneous editing)
// ---------------------------------------------------------------------------

export const REVIEW_REQUEST_STATUSES = [
  "open",
  "approved",
  "changes_requested",
  "closed",
] as const;
export type ReviewRequestStatus = (typeof REVIEW_REQUEST_STATUSES)[number];

const REVIEW_REQUEST_TRANSITIONS: Record<
  ReviewRequestStatus,
  readonly ReviewRequestStatus[]
> = {
  open: ["approved", "changes_requested", "closed"],
  changes_requested: ["open", "closed"], // author revises and re-requests
  approved: ["closed"],
  closed: [],
};

export function canTransitionReviewRequest(
  from: ReviewRequestStatus,
  to: ReviewRequestStatus,
): boolean {
  return REVIEW_REQUEST_TRANSITIONS[from].includes(to);
}

export const REVIEW_SUBJECT_TYPES = ["lesson", "course", "assessment"] as const;
export type ReviewSubjectType = (typeof REVIEW_SUBJECT_TYPES)[number];

// ---------------------------------------------------------------------------
// Path canvas layout (presentation only — never semantic authority)
// ---------------------------------------------------------------------------

export const pathLayoutSchema = z.strictObject({
  schemaVersion: z.literal(1),
  positions: z
    .array(
      z.strictObject({
        nodeId: z.uuid(),
        x: z.number().min(-10_000).max(10_000),
        y: z.number().min(-10_000).max(10_000),
      }),
    )
    .max(200),
});
export type PathLayout = z.infer<typeof pathLayoutSchema>;
