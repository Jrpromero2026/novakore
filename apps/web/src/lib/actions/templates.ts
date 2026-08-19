"use server";

import { revalidatePath } from "next/cache";
import {
  applyVariables,
  checkTemplateVariables,
  contentBlockSchema,
  contentTemplateInputSchema,
  extractVariables,
  missingRequired,
  templateVariablesSchema,
  type TemplateVariable,
} from "@novakore/domain";
import { can, requireOrgContext } from "../org-context";
import { supabaseServer } from "../supabase/server";
import { invalidateOrg } from "../cache";
import { dbErrorMessage, fieldErrors, type ActionState } from "./types";

/**
 * Content template authoring and instantiation.
 *
 * The point of the feature: capture a *shape* once — a procedure with its
 * code, purpose, steps and boundaries — and stamp it out repeatedly with the
 * organization-specific details filled in. Everything a template produces is
 * ordinary lesson content; nothing downstream knows a template was involved.
 */

/**
 * Capture a lesson's current blocks as a reusable template.
 *
 * Variables are DERIVED from the blocks rather than declared separately, so a
 * template can never ship with a placeholder nothing prompts for. Whoever
 * writes the source lesson types `{{aed_location}}` where the local detail
 * goes, and the form builds itself.
 */
export async function createTemplateFromLessonAction(
  orgSlug: string,
  lessonId: string,
  input: { title: string; description?: string; category?: string },
): Promise<ActionState> {
  const ctx = await requireOrgContext(orgSlug);
  if (!can(ctx, "library.manage")) {
    return { ok: false, message: "Saving a template requires library.manage." };
  }

  const parsed = contentTemplateInputSchema
    .omit({ variables: true })
    .safeParse(input);
  if (!parsed.success) return fieldErrors(parsed.error);

  const supabase = await supabaseServer();
  const { data: blocks } = await supabase
    .from("content_blocks")
    .select("block_type, schema_version, data")
    .eq("lesson_id", lessonId)
    .eq("organization_id", ctx.organization.id)
    .order("position");

  if (!blocks?.length) {
    return { ok: false, message: "That lesson has no blocks to capture." };
  }

  const shaped = blocks.map((b) => ({
    type: b.block_type,
    schemaVersion: b.schema_version,
    data: b.data,
  }));

  // Every placeholder becomes a required variable, labelled from its key.
  // The author renames and relaxes them afterwards; deriving them here means
  // the template is coherent from the moment it is saved.
  const variables: TemplateVariable[] = extractVariables(shaped).map((key) => ({
    key,
    label: key.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()),
    required: true,
  }));

  const { error } = await supabase.from("content_templates").insert({
    organization_id: ctx.organization.id,
    title: parsed.data.title,
    description: parsed.data.description ?? null,
    category: parsed.data.category,
    variables: variables as never,
    blocks: shaped as never,
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };

  invalidateOrg(ctx.organization.id);
  revalidatePath(`/${orgSlug}/admin/studio/templates`);
  return {
    ok: true,
    message: variables.length
      ? `Template saved with ${variables.length} variable${variables.length === 1 ? "" : "s"}.`
      : "Template saved.",
  };
}

/** Rename, re-describe, and adjust variable labels — never the block content. */
export async function updateTemplateAction(
  orgSlug: string,
  templateId: string,
  input: {
    title: string;
    description?: string;
    category?: string;
    variables?: unknown;
  },
): Promise<ActionState> {
  const ctx = await requireOrgContext(orgSlug);
  if (!can(ctx, "library.manage")) {
    return {
      ok: false,
      message: "Editing a template requires library.manage.",
    };
  }

  const parsed = contentTemplateInputSchema
    .omit({ variables: true })
    .safeParse(input);
  if (!parsed.success) return fieldErrors(parsed.error);

  const supabase = await supabaseServer();
  const { data: existing } = await supabase
    .from("content_templates")
    .select("blocks")
    .eq("id", templateId)
    .eq("organization_id", ctx.organization.id)
    .maybeSingle();
  if (!existing) return { ok: false, message: "Template not found." };

  const vars = templateVariablesSchema.safeParse(input.variables ?? []);
  if (!vars.success) return fieldErrors(vars.error);

  // A template whose blocks reference a variable it does not declare would
  // publish a raw {{placeholder}} with no field to fill it. Refuse rather
  // than save something that can only fail later.
  const check = checkTemplateVariables(existing.blocks, vars.data);
  if (check.undeclared.length) {
    return {
      ok: false,
      message: `These placeholders have no variable defined: ${check.undeclared.join(", ")}.`,
    };
  }

  const { error } = await supabase
    .from("content_templates")
    .update({
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      category: parsed.data.category,
      variables: vars.data as never,
    })
    .eq("id", templateId)
    .eq("organization_id", ctx.organization.id);
  if (error) return { ok: false, message: dbErrorMessage(error) };

  invalidateOrg(ctx.organization.id);
  revalidatePath(`/${orgSlug}/admin/studio/templates`);
  return {
    ok: true,
    warnings: check.unused.length
      ? [`Declared but never used: ${check.unused.join(", ")}.`]
      : undefined,
    message: "Template updated.",
  };
}

export async function archiveTemplateAction(
  orgSlug: string,
  templateId: string,
): Promise<ActionState> {
  const ctx = await requireOrgContext(orgSlug);
  if (!can(ctx, "library.manage")) {
    return {
      ok: false,
      message: "Archiving a template requires library.manage.",
    };
  }
  const supabase = await supabaseServer();
  const { error } = await supabase
    .from("content_templates")
    .update({ status: "archived", archived_at: new Date().toISOString() })
    .eq("id", templateId)
    .eq("organization_id", ctx.organization.id);
  if (error) return { ok: false, message: dbErrorMessage(error) };

  invalidateOrg(ctx.organization.id);
  revalidatePath(`/${orgSlug}/admin/studio/templates`);
  return { ok: true, message: "Template archived." };
}

/**
 * Stamp a template into a lesson with the supplied values.
 *
 * Refuses on a missing required value rather than inserting content with
 * holes in it. That matters most for exactly the content this feature exists
 * for: a safety procedure missing its AED location is worse than no procedure
 * at all, because it looks finished.
 */
export async function applyTemplateAction(
  orgSlug: string,
  templateId: string,
  lessonId: string,
  values: Record<string, string>,
): Promise<ActionState> {
  const ctx = await requireOrgContext(orgSlug);
  if (!can(ctx, "content.author")) {
    return { ok: false, message: "Editing lessons requires content.author." };
  }

  const supabase = await supabaseServer();
  const [{ data: template }, { data: lesson }] = await Promise.all([
    supabase
      .from("content_templates")
      .select("title, variables, blocks, status")
      .eq("id", templateId)
      .eq("organization_id", ctx.organization.id)
      .maybeSingle(),
    supabase
      .from("lessons")
      .select("id")
      .eq("id", lessonId)
      .eq("organization_id", ctx.organization.id)
      .maybeSingle(),
  ]);

  if (!template) return { ok: false, message: "Template not found." };
  if (template.status !== "active") {
    return { ok: false, message: "That template has been archived." };
  }
  if (!lesson) return { ok: false, message: "Lesson not found." };

  const declared = templateVariablesSchema.safeParse(template.variables);
  if (!declared.success) {
    return { ok: false, message: "This template's variables are malformed." };
  }

  const missing = missingRequired(declared.data, values);
  if (missing.length) {
    const labels = declared.data
      .filter((v) => missing.includes(v.key))
      .map((v) => v.label);
    return {
      ok: false,
      message: `Fill in ${labels.join(", ")} before applying this template.`,
    };
  }

  const { value: filled, unresolved } = applyVariables(
    template.blocks as unknown[],
    values,
  );

  if (!Array.isArray(filled) || filled.length === 0) {
    return { ok: false, message: "This template has no blocks to apply." };
  }

  // Append after whatever is already there, using the same fractional
  // positioning the editor uses.
  const { data: lastBlock } = await supabase
    .from("content_blocks")
    .select("position")
    .eq("lesson_id", lessonId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  let position = lastBlock ? `${lastBlock.position}n` : "a0";
  let inserted = 0;
  for (const raw of filled) {
    const parsed = contentBlockSchema.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        message: `Block ${inserted + 1} failed validation; ${inserted} block(s) were inserted before it.`,
      };
    }
    const { error } = await supabase.from("content_blocks").insert({
      id: crypto.randomUUID(),
      organization_id: ctx.organization.id,
      lesson_id: lessonId,
      block_type: parsed.data.type,
      schema_version: parsed.data.schemaVersion,
      data: parsed.data.data as never,
      position,
    });
    if (error) return { ok: false, message: dbErrorMessage(error) };
    position = `${position}n`;
    inserted += 1;
  }

  invalidateOrg(ctx.organization.id);
  revalidatePath(`/${orgSlug}/admin/studio`);
  return {
    ok: true,
    message: `Added ${inserted} block${inserted === 1 ? "" : "s"} from “${template.title}”.`,
    // Optional variables left blank stay visible as {{placeholders}} — say so
    // rather than let an author discover them after publishing.
    warnings: unresolved.length
      ? [
          `Left unfilled: ${unresolved.join(", ")}. These still show as {{placeholders}} in the draft.`,
        ]
      : undefined,
  };
}
