"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  PRACTICAL_RESULTS,
  practicalRubricRecordSchema,
} from "@novakore/domain";
import { can, requireOrgContext } from "../org-context";
import { supabaseServer } from "../supabase/server";
import type { ActionState } from "./types";

/**
 * Practical evaluation actions. The RPC holds the hard invariants
 * (assessment.grade, no self-evaluation, learner-has-reached-the-gate,
 * append-only record); here we validate shape and reflect authorization in
 * the UI.
 */

const inputSchema = z.object({
  enrollmentId: z.uuid(),
  requirementId: z.uuid(),
  result: z.enum(PRACTICAL_RESULTS),
  rubric: practicalRubricRecordSchema,
  evidence: z.string().trim().max(10_000).optional(),
  comments: z.string().trim().max(10_000).optional(),
});

export async function recordPracticalEvaluationAction(
  orgSlug: string,
  input: z.input<typeof inputSchema>,
): Promise<ActionState> {
  const ctx = await requireOrgContext(orgSlug);
  if (!can(ctx, "assessment.grade")) {
    return {
      ok: false,
      message: "Recording a practical evaluation requires assessment.grade.",
    };
  }
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "The evaluation record is not valid." };
  }
  const supabase = await supabaseServer();
  const { error } = await supabase.rpc("record_practical_evaluation", {
    p_enrollment_id: parsed.data.enrollmentId,
    p_requirement_id: parsed.data.requirementId,
    p_result: parsed.data.result,
    p_rubric: parsed.data.rubric,
    p_evidence:
      parsed.data.evidence && parsed.data.evidence !== ""
        ? parsed.data.evidence
        : undefined,
    p_comments:
      parsed.data.comments && parsed.data.comments !== ""
        ? parsed.data.comments
        : undefined,
  });
  if (error) return { ok: false, message: error.message };
  revalidatePath(`/${orgSlug}/admin/practicals`);
  return { ok: true, message: "Evaluation recorded." };
}
