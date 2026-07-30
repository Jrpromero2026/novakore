"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Json } from "@novakore/database";
import { requireOrgContext, can } from "@/lib/org-context";
import { supabaseServer } from "@/lib/supabase/server";
import {
  FEEDBACK_CATEGORY_VALUES,
  FEEDBACK_SEVERITIES,
  FEEDBACK_STATUSES,
  TESTER_LABEL_VALUES,
} from "@/lib/feedback";
import { dbErrorMessage, type ActionState } from "./types";

const submitSchema = z.object({
  category: z.enum(FEEDBACK_CATEGORY_VALUES as [string, ...string[]]),
  severity: z.enum(FEEDBACK_SEVERITIES).optional().nullable(),
  message: z.string().trim().min(3).max(4000),
  context: z.record(z.string(), z.unknown()).default({}),
});

/** Any active member submits feedback (RLS enforces own-membership). */
export async function submitFeedbackAction(
  orgSlug: string,
  input: unknown,
): Promise<ActionState> {
  const parsed = submitSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "Please add a short description." };
  }
  const ctx = await requireOrgContext(orgSlug);
  const supabase = await supabaseServer();
  const { error } = await supabase.from("feedback").insert({
    organization_id: ctx.organization.id,
    membership_id: ctx.membershipId,
    category: parsed.data.category,
    severity: parsed.data.severity ?? null,
    message: parsed.data.message,
    context: parsed.data.context as Json,
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  return { ok: true, message: "Thanks — your feedback was sent." };
}

const patchSchema = z.object({
  status: z.enum(FEEDBACK_STATUSES).optional(),
  severity: z.enum(FEEDBACK_SEVERITIES).nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
  resolution: z.string().max(4000).nullable().optional(),
  assigneeMembershipId: z.string().uuid().nullable().optional(),
});

/** Reviewer triage/resolution (analytics.view). */
export async function updateFeedbackAction(
  orgSlug: string,
  feedbackId: string,
  patch: unknown,
): Promise<ActionState> {
  const ctx = await requireOrgContext(orgSlug);
  if (!can(ctx, "analytics.view")) {
    return { ok: false, message: "You do not have permission to do that." };
  }
  const parsed = patchSchema.safeParse(patch);
  if (!parsed.success) return { ok: false, message: "Invalid update." };
  const p = parsed.data;
  const supabase = await supabaseServer();
  const { error } = await supabase
    .from("feedback")
    .update({
      ...(p.status !== undefined ? { status: p.status } : {}),
      ...(p.severity !== undefined ? { severity: p.severity } : {}),
      ...(p.notes !== undefined ? { notes: p.notes } : {}),
      ...(p.resolution !== undefined ? { resolution: p.resolution } : {}),
      ...(p.assigneeMembershipId !== undefined
        ? { assignee_membership_id: p.assigneeMembershipId }
        : {}),
    })
    .eq("id", feedbackId)
    .eq("organization_id", ctx.organization.id);
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath(`/${orgSlug}/admin/ops`);
  return { ok: true, message: "Updated." };
}

const labelSchema = z.enum(TESTER_LABEL_VALUES as [string, ...string[]]);

export async function setTesterLabelAction(
  orgSlug: string,
  membershipId: string,
  label: string,
): Promise<ActionState> {
  const ctx = await requireOrgContext(orgSlug);
  if (!can(ctx, "analytics.view")) {
    return { ok: false, message: "You do not have permission to do that." };
  }
  if (
    !labelSchema.safeParse(label).success ||
    !z.string().uuid().safeParse(membershipId).success
  ) {
    return { ok: false, message: "Invalid tester label." };
  }
  const supabase = await supabaseServer();
  const { error } = await supabase.from("tester_labels").upsert(
    {
      organization_id: ctx.organization.id,
      membership_id: membershipId,
      label,
    },
    { onConflict: "membership_id,label", ignoreDuplicates: true },
  );
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath(`/${orgSlug}/admin/ops`);
  return { ok: true, message: "Tester label added." };
}

export async function removeTesterLabelAction(
  orgSlug: string,
  membershipId: string,
  label: string,
): Promise<ActionState> {
  const ctx = await requireOrgContext(orgSlug);
  if (!can(ctx, "analytics.view")) {
    return { ok: false, message: "You do not have permission to do that." };
  }
  const supabase = await supabaseServer();
  const { error } = await supabase
    .from("tester_labels")
    .delete()
    .eq("organization_id", ctx.organization.id)
    .eq("membership_id", membershipId)
    .eq("label", label);
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath(`/${orgSlug}/admin/ops`);
  return { ok: true, message: "Tester label removed." };
}
