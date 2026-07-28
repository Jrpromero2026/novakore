"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  assessmentItemSchema,
  assessmentSettingsSchema,
  certificateTemplateSchema,
  responseSchemas,
  type AssessmentItemType,
} from "@novakore/domain";
import { can, requireOrgContext } from "../org-context";
import { requireUser } from "../auth";
import { supabaseServer } from "../supabase/server";
import { dbErrorMessage, fieldErrors, type ActionState } from "./types";

/**
 * Assessment actions (D-08 contract). The RPCs hold the hard invariants;
 * here we deep-validate every item, settings object, and response against
 * the domain registry before anything touches the database, and check
 * can() so the UI reflects real authorization.
 */

const titled = z.object({
  title: z
    .string()
    .trim()
    .min(2, { error: "Title must be at least 2 characters." })
    .max(200),
});

// ---------------------------------------------------------------------------
// Authoring
// ---------------------------------------------------------------------------

export async function createAssessmentAction(
  orgSlug: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireOrgContext(orgSlug);
  if (!can(ctx, "assessment.author")) {
    return {
      ok: false,
      message: "You do not have permission to author assessments.",
    };
  }
  const parsed = titled
    .extend({
      assessmentType: z.enum([
        "knowledge_check",
        "quiz",
        "exam",
        "assignment",
        "observation",
        "manual_review",
      ]),
    })
    .safeParse({
      title: formData.get("title"),
      assessmentType: formData.get("assessmentType"),
    });
  if (!parsed.success) return fieldErrors(parsed.error);

  const user = await requireUser();
  const supabase = await supabaseServer();
  const { data, error } = await supabase
    .from("assessments")
    .insert({
      organization_id: ctx.organization.id,
      title: parsed.data.title,
      assessment_type: parsed.data.assessmentType,
      settings: {
        schemaVersion: 1,
        passingPercent: 70,
        cooldownMinutes: 0,
        scorePolicy: "highest",
      },
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath(`/${orgSlug}/admin/assessments`);
  return { ok: true, message: "Assessment created.", data: { id: data.id } };
}

export async function saveAssessmentAction(
  orgSlug: string,
  assessmentId: string,
  input: {
    title: string;
    settings: unknown;
    items: {
      id: string;
      type: AssessmentItemType;
      schemaVersion: number;
      data: unknown;
      position: string;
      required: boolean;
    }[];
  },
): Promise<ActionState> {
  const ctx = await requireOrgContext(orgSlug);
  if (!can(ctx, "assessment.author")) {
    return {
      ok: false,
      message: "You do not have permission to author assessments.",
    };
  }
  const title = titled.safeParse({ title: input.title });
  if (!title.success) return fieldErrors(title.error);
  const settings = assessmentSettingsSchema.safeParse(input.settings);
  if (!settings.success) {
    return { ok: false, message: "Assessment settings are invalid." };
  }
  // deep-validate every item against the registry — the no-dumping-ground rule
  const validated = [];
  for (const item of input.items) {
    const parsed = assessmentItemSchema.safeParse(item);
    if (!parsed.success) {
      return {
        ok: false,
        message: `Item ${validated.length + 1} is invalid: ${parsed.error.issues[0]?.message ?? "invalid"}`,
      };
    }
    validated.push(parsed.data);
  }

  const supabase = await supabaseServer();
  const { error: metaError } = await supabase
    .from("assessments")
    .update({ title: title.data.title, settings: settings.data })
    .eq("id", assessmentId)
    .eq("organization_id", ctx.organization.id);
  if (metaError) return { ok: false, message: dbErrorMessage(metaError) };

  // replace draft items (delete removed, upsert current)
  const keepIds = validated.map((i) => i.id);
  const deleteQuery = supabase
    .from("assessment_items")
    .delete()
    .eq("assessment_id", assessmentId);
  const { error: deleteError } = await (keepIds.length > 0
    ? deleteQuery.not("id", "in", `(${keepIds.join(",")})`)
    : deleteQuery);
  if (deleteError) return { ok: false, message: dbErrorMessage(deleteError) };

  for (const item of validated) {
    const { error } = await supabase.from("assessment_items").upsert({
      id: item.id,
      organization_id: ctx.organization.id,
      assessment_id: assessmentId,
      item_type: item.type,
      schema_version: item.schemaVersion,
      data: item.data as never,
      position: item.position,
      required: item.required,
    });
    if (error) return { ok: false, message: dbErrorMessage(error) };
  }
  revalidatePath(`/${orgSlug}/admin/assessments/${assessmentId}`);
  return { ok: true, message: "Draft saved." };
}

export async function publishAssessmentAction(
  orgSlug: string,
  assessmentId: string,
): Promise<ActionState> {
  const ctx = await requireOrgContext(orgSlug);
  if (!can(ctx, "assessment.publish")) {
    return { ok: false, message: "Publishing requires assessment.publish." };
  }
  const supabase = await supabaseServer();
  // pre-flight deep validation of every draft item + settings
  const [{ data: assessment }, { data: items }] = await Promise.all([
    supabase
      .from("assessments")
      .select("settings")
      .eq("id", assessmentId)
      .eq("organization_id", ctx.organization.id)
      .maybeSingle(),
    supabase
      .from("assessment_items")
      .select("id, item_type, schema_version, data, position, required")
      .eq("assessment_id", assessmentId),
  ]);
  if (!assessment) return { ok: false, message: "Assessment not found." };
  const settings = assessmentSettingsSchema.safeParse(assessment.settings);
  if (!settings.success) {
    return {
      ok: false,
      message: "Fix the assessment settings before publishing.",
    };
  }
  if (!items || items.length === 0) {
    return { ok: false, message: "Add at least one item before publishing." };
  }
  for (const raw of items) {
    const parsed = assessmentItemSchema.safeParse({
      id: raw.id,
      type: raw.item_type,
      schemaVersion: raw.schema_version,
      data: raw.data,
      position: raw.position,
      required: raw.required,
    });
    if (!parsed.success) {
      return {
        ok: false,
        message: `Publishing blocked: an item is invalid (${parsed.error.issues[0]?.message ?? "invalid"}).`,
      };
    }
  }

  const { error } = await supabase.rpc("publish_assessment", {
    p_assessment_id: assessmentId,
  });
  if (error) return { ok: false, message: error.message };
  revalidatePath(`/${orgSlug}/admin/assessments/${assessmentId}`);
  return { ok: true, message: "Assessment published." };
}

// ---------------------------------------------------------------------------
// Assignment
// ---------------------------------------------------------------------------

export async function assignAssessmentAction(
  orgSlug: string,
  lessonId: string,
  assessmentId: string,
  required: boolean,
): Promise<ActionState> {
  const ctx = await requireOrgContext(orgSlug);
  if (!can(ctx, "assessment.assign")) {
    return {
      ok: false,
      message: "Attaching assessments requires assessment.assign.",
    };
  }
  const supabase = await supabaseServer();
  const { error } = await supabase.rpc("assign_assessment", {
    p_lesson_id: lessonId,
    p_assessment_id: assessmentId,
    p_required: required,
    p_completion_effect: "complete_lesson",
  });
  if (error) return { ok: false, message: error.message };
  revalidatePath(`/${orgSlug}/admin/assessments/${assessmentId}`);
  return { ok: true, message: "Assessment attached." };
}

export async function archiveAssignmentAction(
  orgSlug: string,
  assignmentId: string,
): Promise<ActionState> {
  const ctx = await requireOrgContext(orgSlug);
  if (!can(ctx, "assessment.assign")) {
    return {
      ok: false,
      message: "Managing assignments requires assessment.assign.",
    };
  }
  const supabase = await supabaseServer();
  const { error } = await supabase.rpc("set_assessment_assignment_status", {
    p_assignment_id: assignmentId,
    p_status: "archived",
  });
  if (error) return { ok: false, message: error.message };
  revalidatePath(`/${orgSlug}/admin/assessments`);
  return { ok: true, message: "Assignment archived." };
}

// ---------------------------------------------------------------------------
// Learner attempt flow
// ---------------------------------------------------------------------------

export async function startAttemptAction(
  orgSlug: string,
  assignmentId: string,
  enrollmentId: string,
): Promise<ActionState> {
  await requireOrgContext(orgSlug);
  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc("start_assessment_attempt", {
    p_assignment_id: assignmentId,
    p_enrollment_id: enrollmentId,
  });
  if (error) return { ok: false, message: error.message };
  return { ok: true, data: { attemptId: data } };
}

export async function saveResponseAction(
  orgSlug: string,
  attemptId: string,
  itemId: string,
  itemType: AssessmentItemType,
  response: unknown,
): Promise<ActionState> {
  await requireOrgContext(orgSlug);
  const parsed = responseSchemas[itemType]?.safeParse(response);
  if (!parsed || !parsed.success) {
    return {
      ok: false,
      message: "That response is not valid for this question.",
    };
  }
  const supabase = await supabaseServer();
  const { error } = await supabase.rpc("save_assessment_response", {
    p_attempt_id: attemptId,
    p_item_id: itemId,
    p_response: parsed.data as never,
  });
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

export async function submitAttemptAction(
  orgSlug: string,
  attemptId: string,
): Promise<ActionState> {
  await requireOrgContext(orgSlug);
  const supabase = await supabaseServer();
  const { error } = await supabase.rpc("submit_assessment_attempt", {
    p_attempt_id: attemptId,
  });
  if (error) return { ok: false, message: error.message };
  revalidatePath(`/${orgSlug}/learn`);
  return { ok: true, message: "Attempt submitted." };
}

// ---------------------------------------------------------------------------
// Review
// ---------------------------------------------------------------------------

export async function claimReviewAction(
  orgSlug: string,
  attemptId: string,
): Promise<ActionState> {
  const ctx = await requireOrgContext(orgSlug);
  if (!can(ctx, "assessment.grade")) {
    return { ok: false, message: "Reviewing requires assessment.grade." };
  }
  const supabase = await supabaseServer();
  const { error } = await supabase.rpc("claim_assessment_review", {
    p_attempt_id: attemptId,
  });
  if (error) return { ok: false, message: error.message };
  revalidatePath(`/${orgSlug}/admin/reviews/${attemptId}`);
  return { ok: true, message: "Review claimed." };
}

export async function completeReviewAction(
  orgSlug: string,
  attemptId: string,
  itemScores: Record<string, number>,
  itemFeedback: Record<string, string>,
  overallFeedback: string,
): Promise<ActionState> {
  const ctx = await requireOrgContext(orgSlug);
  if (!can(ctx, "assessment.grade")) {
    return { ok: false, message: "Reviewing requires assessment.grade." };
  }
  for (const value of Object.values(itemScores)) {
    if (!Number.isFinite(value) || value < 0) {
      return { ok: false, message: "Scores must be zero or positive numbers." };
    }
  }
  const supabase = await supabaseServer();
  const { error } = await supabase.rpc("complete_assessment_review", {
    p_attempt_id: attemptId,
    p_item_scores: itemScores,
    p_item_feedback: itemFeedback,
    p_overall_feedback:
      overallFeedback.trim() === "" ? undefined : overallFeedback.trim(),
  });
  if (error) return { ok: false, message: error.message };
  revalidatePath(`/${orgSlug}/admin/reviews`);
  return { ok: true, message: "Review completed." };
}

// ---------------------------------------------------------------------------
// Certificates + credentials
// ---------------------------------------------------------------------------

export async function createTemplateAction(
  orgSlug: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireOrgContext(orgSlug);
  if (!can(ctx, "certificates.manage")) {
    return {
      ok: false,
      message: "Managing certificates requires certificates.manage.",
    };
  }
  const name = z
    .string()
    .trim()
    .min(2)
    .max(200)
    .safeParse(formData.get("name"));
  const template = certificateTemplateSchema.safeParse({
    schemaVersion: 1,
    title: formData.get("certTitle"),
    subtitle: formData.get("subtitle") || undefined,
    bodyText: formData.get("bodyText") || undefined,
    signatories: [],
    showVerification: true,
    expirationMonths: formData.get("expirationMonths")
      ? Number(formData.get("expirationMonths"))
      : undefined,
  });
  if (!name.success)
    return { ok: false, message: "Template name must be 2–200 characters." };
  if (!template.success) {
    return {
      ok: false,
      message: `Template is invalid: ${template.error.issues[0]?.message ?? "invalid"}`,
    };
  }
  const user = await requireUser();
  const supabase = await supabaseServer();
  const { error } = await supabase.from("certificate_templates").insert({
    organization_id: ctx.organization.id,
    name: name.data,
    template: template.data as never,
    status: "active",
    created_by: user.id,
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath(`/${orgSlug}/admin/credentials`);
  return { ok: true, message: "Template created." };
}

export async function createCertificateAction(
  orgSlug: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireOrgContext(orgSlug);
  if (!can(ctx, "certificates.manage")) {
    return {
      ok: false,
      message: "Managing certificates requires certificates.manage.",
    };
  }
  const parsed = titled
    .extend({
      templateId: z.uuid(),
      source: z
        .string()
        .regex(/^(course|learning_path|assessment_assignment):[0-9a-f-]{36}$/),
    })
    .safeParse({
      title: formData.get("title"),
      templateId: formData.get("templateId"),
      source: formData.get("source"),
    });
  if (!parsed.success) return fieldErrors(parsed.error);
  const [sourceType, sourceId] = parsed.data.source.split(":") as [
    "course" | "learning_path" | "assessment_assignment",
    string,
  ];
  const user = await requireUser();
  const supabase = await supabaseServer();
  const { error } = await supabase.from("certificates").insert({
    organization_id: ctx.organization.id,
    template_id: parsed.data.templateId,
    title: parsed.data.title,
    source_type: sourceType,
    course_id: sourceType === "course" ? sourceId : null,
    learning_path_id: sourceType === "learning_path" ? sourceId : null,
    assignment_id: sourceType === "assessment_assignment" ? sourceId : null,
    created_by: user.id,
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath(`/${orgSlug}/admin/credentials`);
  return { ok: true, message: "Certificate rule created." };
}

export async function issueCredentialAction(
  orgSlug: string,
  certificateId: string,
  membershipId: string,
): Promise<ActionState> {
  const ctx = await requireOrgContext(orgSlug);
  if (!can(ctx, "credential.issue")) {
    return { ok: false, message: "Issuing requires credential.issue." };
  }
  const supabase = await supabaseServer();
  const { error } = await supabase.rpc("issue_credential", {
    p_certificate_id: certificateId,
    p_membership_id: membershipId,
  });
  if (error) return { ok: false, message: error.message };
  revalidatePath(`/${orgSlug}/admin/credentials`);
  return { ok: true, message: "Credential issued." };
}

export async function revokeCredentialAction(
  orgSlug: string,
  credentialId: string,
  reason: string,
): Promise<ActionState> {
  const ctx = await requireOrgContext(orgSlug);
  if (!can(ctx, "credential.revoke")) {
    return { ok: false, message: "Revoking requires credential.revoke." };
  }
  if (reason.trim().length < 5) {
    return {
      ok: false,
      message: "A revocation reason (at least 5 characters) is required.",
    };
  }
  const supabase = await supabaseServer();
  const { error } = await supabase.rpc("revoke_credential", {
    p_credential_id: credentialId,
    p_reason: reason.trim(),
  });
  if (error) return { ok: false, message: error.message };
  revalidatePath(`/${orgSlug}/admin/credentials`);
  return { ok: true, message: "Credential revoked." };
}
