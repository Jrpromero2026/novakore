import { z } from "zod";
import { contentBlockSchema } from "./content-blocks";

/**
 * NovaKore learning domain (Phase 1C).
 *
 * - Versioned snapshot schemas for immutable published artifacts
 *   (course_versions.structure, completion rules) — the no-dumping-ground
 *   rule (ADR-008) applied to the learning engine.
 * - THE single unlock computation used by every surface (learner UI, admin
 *   inspection, tests). Deterministic, pure, explainable.
 * - Completion computation over bounded, versioned rules.
 * - Prerequisite cycle detection (pure; the database trigger is the
 *   authoritative enforcement, this mirrors it for authoring UX).
 * - Analytics event catalog + envelope schema (analytics-and-events.md).
 */

export const SNAPSHOT_SCHEMA_VERSION = 1 as const;

// ---------------------------------------------------------------------------
// Completion rules (bounded, versioned — no tenant-authored expressions)
// ---------------------------------------------------------------------------

export const completionRuleSchema = z.discriminatedUnion("type", [
  z.strictObject({
    schemaVersion: z.literal(1),
    type: z.literal("all_required_lessons"),
  }),
  z.strictObject({
    schemaVersion: z.literal(1),
    type: z.literal("percentage_of_required_lessons"),
    /** 1–100; completion when completed/required ratio meets this. */
    percent: z.number().int().min(1).max(100),
  }),
]);
export type CompletionRule = z.infer<typeof completionRuleSchema>;

export const DEFAULT_COMPLETION_RULE: CompletionRule = {
  schemaVersion: 1,
  type: "all_required_lessons",
};

// ---------------------------------------------------------------------------
// Published course structure snapshot (course_versions.structure)
// ---------------------------------------------------------------------------

export const structureLessonSchema = z.strictObject({
  lessonId: z.uuid(),
  /** Exact immutable lesson version pinned at publication. */
  lessonVersionId: z.uuid(),
  versionNumber: z.number().int().min(1),
  title: z.string().min(1).max(200),
  position: z.string().min(1),
  required: z.boolean(),
});

export const structureModuleSchema = z.strictObject({
  moduleId: z.uuid(),
  title: z.string().min(1).max(200),
  position: z.string().min(1),
  lessons: z.array(structureLessonSchema).min(1),
});

export const courseStructureSchema = z.strictObject({
  schemaVersion: z.literal(SNAPSHOT_SCHEMA_VERSION),
  modules: z.array(structureModuleSchema).min(1),
});
export type CourseStructure = z.infer<typeof courseStructureSchema>;

/** Frozen lesson content (lesson_versions.blocks). */
export const lessonBlocksSnapshotSchema = z.array(contentBlockSchema).min(1);

const byPosition = <T extends { position: string }>(a: T, b: T) =>
  a.position < b.position ? -1 : a.position > b.position ? 1 : 0;

/** Ordered lesson list for a structure (modules then lessons by position). */
export function orderedLessons(structure: CourseStructure) {
  return [...structure.modules]
    .sort(byPosition)
    .flatMap((m) => [...m.lessons].sort(byPosition));
}

// ---------------------------------------------------------------------------
// Progress + unlock computation (single source of truth)
// ---------------------------------------------------------------------------

export const PROGRESS_STATUSES = [
  "in_progress",
  "completed",
  "exempted",
] as const;
export type ProgressStatus = (typeof PROGRESS_STATUSES)[number];
// An absent progress record means "not started" — status fields themselves
// are never null and never overloaded.

export type LessonAccessState =
  | "available"
  | "completed"
  | "locked_by_sequence"
  | "not_enrolled"
  | "version_unavailable";

export interface LessonAccess {
  lessonId: string;
  lessonVersionId: string;
  state: LessonAccessState;
  /** Human-explainable reason for locked states. */
  reason: string | null;
}

export interface LessonProgressInput {
  lessonId: string;
  status: ProgressStatus;
}

/**
 * Deterministic per-lesson access for one enrolled course version.
 * Sequencing rule (Phase 1C): required lessons unlock in structure order;
 * a lesson is available once every REQUIRED lesson before it is
 * completed/exempted. Optional lessons never block later ones.
 */
export function computeLessonAccess(input: {
  enrollmentStatus: "active" | "completed" | "withdrawn" | "expired";
  structure: CourseStructure;
  progress: LessonProgressInput[];
}): LessonAccess[] {
  const lessons = orderedLessons(input.structure);
  const progressByLesson = new Map(
    input.progress.map((p) => [p.lessonId, p.status]),
  );

  if (
    input.enrollmentStatus === "withdrawn" ||
    input.enrollmentStatus === "expired"
  ) {
    return lessons.map((l) => ({
      lessonId: l.lessonId,
      lessonVersionId: l.lessonVersionId,
      state: "not_enrolled",
      reason: "This enrollment is no longer active.",
    }));
  }

  const result: LessonAccess[] = [];
  let blockingTitle: string | null = null;

  for (const lesson of lessons) {
    const status = progressByLesson.get(lesson.lessonId);
    if (status === "completed" || status === "exempted") {
      result.push({
        lessonId: lesson.lessonId,
        lessonVersionId: lesson.lessonVersionId,
        state: "completed",
        reason: null,
      });
    } else if (blockingTitle === null) {
      result.push({
        lessonId: lesson.lessonId,
        lessonVersionId: lesson.lessonVersionId,
        state: "available",
        reason: null,
      });
    } else {
      result.push({
        lessonId: lesson.lessonId,
        lessonVersionId: lesson.lessonVersionId,
        state: "locked_by_sequence",
        reason: `Complete "${blockingTitle}" first.`,
      });
    }
    // Only REQUIRED, unfinished lessons block what follows.
    const finished = status === "completed" || status === "exempted";
    if (lesson.required && !finished && blockingTitle === null) {
      blockingTitle = lesson.title;
    }
  }
  return result;
}

/** Course completion per the pinned version's bounded rule. */
export function isCourseComplete(input: {
  structure: CourseStructure;
  rule: CompletionRule;
  progress: LessonProgressInput[];
}): boolean {
  const required = orderedLessons(input.structure).filter((l) => l.required);
  if (required.length === 0) return false;
  const done = new Set(
    input.progress
      .filter((p) => p.status === "completed" || p.status === "exempted")
      .map((p) => p.lessonId),
  );
  const completedCount = required.filter((l) => done.has(l.lessonId)).length;
  switch (input.rule.type) {
    case "all_required_lessons":
      return completedCount === required.length;
    case "percentage_of_required_lessons":
      return (completedCount / required.length) * 100 >= input.rule.percent;
  }
}

// ---------------------------------------------------------------------------
// Path-level access (prerequisite edges between course nodes)
// ---------------------------------------------------------------------------

export type PathNodeState =
  "available" | "completed" | "locked_by_prerequisite" | "not_enrolled";

export interface PathNodeAccess {
  nodeId: string;
  courseId: string;
  state: PathNodeState;
  reason: string | null;
}

export function computePathAccess(input: {
  enrollmentStatus: "active" | "completed" | "withdrawn" | "expired";
  nodes: {
    nodeId: string;
    courseId: string;
    title: string;
    position: string;
  }[];
  /** Edges: node → required node (requirement = completed). */
  prerequisites: { nodeId: string; requiresNodeId: string }[];
  completedCourseIds: string[];
}): PathNodeAccess[] {
  if (
    input.enrollmentStatus === "withdrawn" ||
    input.enrollmentStatus === "expired"
  ) {
    return input.nodes.map((n) => ({
      nodeId: n.nodeId,
      courseId: n.courseId,
      state: "not_enrolled",
      reason: "This enrollment is no longer active.",
    }));
  }
  const nodesById = new Map(input.nodes.map((n) => [n.nodeId, n]));
  const completed = new Set(input.completedCourseIds);
  const requirementsFor = new Map<string, string[]>();
  for (const edge of input.prerequisites) {
    const list = requirementsFor.get(edge.nodeId) ?? [];
    list.push(edge.requiresNodeId);
    requirementsFor.set(edge.nodeId, list);
  }

  return [...input.nodes].sort(byPosition).map((node) => {
    if (completed.has(node.courseId)) {
      return {
        nodeId: node.nodeId,
        courseId: node.courseId,
        state: "completed" as const,
        reason: null,
      };
    }
    const unmet = (requirementsFor.get(node.nodeId) ?? []).filter((req) => {
      const requiredNode = nodesById.get(req);
      return requiredNode ? !completed.has(requiredNode.courseId) : true;
    });
    if (unmet.length > 0) {
      const titles = unmet
        .map((id) => nodesById.get(id)?.title ?? "a prerequisite")
        .join(", ");
      return {
        nodeId: node.nodeId,
        courseId: node.courseId,
        state: "locked_by_prerequisite" as const,
        reason: `Complete ${titles} first.`,
      };
    }
    return {
      nodeId: node.nodeId,
      courseId: node.courseId,
      state: "available" as const,
      reason: null,
    };
  });
}

/**
 * Prerequisite cycle detection (pure mirror of the authoritative database
 * trigger): DFS over edges; returns true when adding candidate creates a
 * cycle (including self-dependency).
 */
export function wouldCreateCycle(
  edges: { nodeId: string; requiresNodeId: string }[],
  candidate: { nodeId: string; requiresNodeId: string },
): boolean {
  if (candidate.nodeId === candidate.requiresNodeId) return true;
  const adjacency = new Map<string, string[]>();
  for (const e of [...edges, candidate]) {
    const list = adjacency.get(e.nodeId) ?? [];
    list.push(e.requiresNodeId);
    adjacency.set(e.nodeId, list);
  }
  // Cycle exists iff candidate.requiresNodeId can reach candidate.nodeId.
  const stack = [candidate.requiresNodeId];
  const seen = new Set<string>();
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current === candidate.nodeId) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    for (const next of adjacency.get(current) ?? []) stack.push(next);
  }
  return false;
}

// ---------------------------------------------------------------------------
// Analytics event catalog (docs/domain/event-catalog.md)
// ---------------------------------------------------------------------------

export const EVENT_TYPES = [
  "enrollment.learner.enrolled",
  "enrollment.learner.completed",
  "enrollment.learner.withdrawn",
  "learning.lesson.started",
  "learning.lesson.completed",
  "learning.course.started",
  "learning.course.completed",
  "learning.path.completed",
  "learning.progress.overridden",
  "content.lesson.published",
  "content.course.published",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const ENVELOPE_VERSION = 1 as const;

/** Analytics event envelope (frozen shape; additive evolution via `v`). */
export const eventEnvelopeSchema = z.strictObject({
  id: z.uuid(),
  v: z.literal(ENVELOPE_VERSION),
  type: z.enum(EVENT_TYPES),
  organization_id: z.uuid(),
  occurred_at: z.string().min(1),
  actor_user_id: z.uuid().nullable(),
  subject_kind: z.string().min(1).max(40),
  subject_id: z.uuid(),
  /** Resolution chain incl. exact version ids where applicable. */
  context: z.record(
    z.string(),
    z.union([z.string(), z.number(), z.boolean(), z.null()]),
  ),
  data: z.record(
    z.string(),
    z.union([z.string(), z.number(), z.boolean(), z.null()]),
  ),
  correlation_id: z.string().max(128).nullable(),
  causation_id: z.string().max(128).nullable(),
});
export type EventEnvelope = z.infer<typeof eventEnvelopeSchema>;
