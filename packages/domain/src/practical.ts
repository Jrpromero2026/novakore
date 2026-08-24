import { z } from "zod";

// ---------------------------------------------------------------------------
// Practical evaluations — observed sign-offs and terminal defenses.
//
// The platform records what a human evaluator observed and decided; nothing
// here derives, scores, or automates an interpretation. Rubrics are applied
// by the evaluator — the platform stores the definition and the recorded
// scores verbatim. SQL twin: supabase/migrations/*_practical_evaluation_foundation.sql
// ---------------------------------------------------------------------------

export const PRACTICAL_KINDS = [
  "practical_sign_off",
  "terminal_defense",
] as const;
export type PracticalKind = (typeof PRACTICAL_KINDS)[number];

export const PRACTICAL_RESULTS = [
  "passed",
  "remediation_required",
  "failed",
] as const;
export type PracticalResult = (typeof PRACTICAL_RESULTS)[number];

/**
 * Rubric definition carried by a practical requirement — recorded verbatim
 * from the governing curriculum. Dimensions are names; the pass rule is prose
 * because it is applied by a person, never by the platform.
 */
export const practicalRubricDefinitionSchema = z.strictObject({
  dimensions: z.array(z.string().min(1).max(160)).min(1).max(16),
  scale: z.string().min(1).max(120).optional(),
  pass: z.string().min(1).max(500).optional(),
  nonCompensable: z.array(z.string().min(1).max(300)).max(16).optional(),
});
export type PracticalRubricDefinition = z.infer<
  typeof practicalRubricDefinitionSchema
>;

/** Human-recorded rubric outcome attached to one evaluation. */
export const practicalRubricRecordSchema = z.strictObject({
  scores: z
    .array(
      z.strictObject({
        dimension: z.string().min(1).max(160),
        score: z.number().min(0).max(100),
        note: z.string().min(1).max(1000).optional(),
      }),
    )
    .max(16)
    .optional(),
  summary: z.string().min(1).max(2000).optional(),
});
export type PracticalRubricRecord = z.infer<typeof practicalRubricRecordSchema>;

export interface PracticalRequirementView {
  requirementId: string;
  lessonId: string;
  kind: PracticalKind;
  code: string;
  title: string;
}

export interface PracticalEvaluationView {
  requirementId: string;
  result: PracticalResult;
  evaluatedAt: string;
}

export type PracticalStatus =
  "not_evaluated" | "passed" | "remediation_open" | "failed";

/**
 * Status of one requirement for one enrollment, derived from its evaluation
 * history: a pass stands permanently (evaluations are append-only and a pass
 * is unique per enrollment+requirement); otherwise the most recent evaluation
 * speaks; otherwise the requirement is not yet evaluated.
 */
export function practicalStatus(
  requirementId: string,
  evaluations: readonly PracticalEvaluationView[],
): PracticalStatus {
  const own = evaluations
    .filter((e) => e.requirementId === requirementId)
    .sort((a, b) => a.evaluatedAt.localeCompare(b.evaluatedAt));
  if (own.some((e) => e.result === "passed")) return "passed";
  const latest = own.at(-1);
  if (!latest) return "not_evaluated";
  return latest.result === "remediation_required"
    ? "remediation_open"
    : "failed";
}

/** Requirements that still block completion (no recorded pass). */
export function outstandingPracticals(
  requirements: readonly PracticalRequirementView[],
  evaluations: readonly PracticalEvaluationView[],
): PracticalRequirementView[] {
  return requirements.filter(
    (r) => practicalStatus(r.requirementId, evaluations) !== "passed",
  );
}

/** True when any requirement's latest state is an open remediation. */
export function hasOpenRemediation(
  requirements: readonly PracticalRequirementView[],
  evaluations: readonly PracticalEvaluationView[],
): boolean {
  return requirements.some(
    (r) => practicalStatus(r.requirementId, evaluations) === "remediation_open",
  );
}
