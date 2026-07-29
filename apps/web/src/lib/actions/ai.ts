"use server";

import { revalidatePath } from "next/cache";
import {
  flashcardDraftSchema,
  generationRequestSchema,
  knowledgeChecksSchema,
  lessonDraftSchema,
  reflectionPromptsSchema,
  scenarioDraftSchema,
  courseOutlineSchema,
  validateAiOutput,
  type AiOperation,
} from "@novakore/domain";
import { can, requireOrgContext } from "../org-context";
import { requireUser } from "../auth";
import { supabaseServer } from "../supabase/server";
import { getProvider } from "../ai/providers";
import {
  flashcardsToBlocks,
  knowledgeChecksToBlocks,
  reflectionsToBlocks,
  scenarioToBlocks,
} from "../ai/convert";
import { appendBlocksToLessonAction } from "./studio";
import { dbErrorMessage, type ActionState } from "./types";

/**
 * Governed AI generation (ADR-010/023/024). The full lifecycle is:
 * reserve (budget hard-stop, SQL) → provider call (server only) →
 * schema validation → settle (cost reconciliation) → accept/reject.
 * Generated content is always draft; nothing here can publish.
 */

export async function runGenerationAction(
  orgSlug: string,
  input: {
    operation: AiOperation;
    profile: "drafting" | "structured" | "rewrite";
    objective: string;
    audience?: string;
    readingLevel?: "introductory" | "intermediate" | "advanced";
    sourceDocumentIds: string[];
    inputText?: string;
  },
): Promise<ActionState> {
  const ctx = await requireOrgContext(orgSlug);
  if (!can(ctx, "ai.author.use")) {
    return { ok: false, message: "Generating requires ai.author.use." };
  }
  const supabase = await supabaseServer();

  // resolve tenant-owned source excerpts (never anything else)
  const sources: {
    sourceDocumentId: string;
    title: string;
    excerpt: string;
  }[] = [];
  if (input.sourceDocumentIds.length > 0) {
    const { data: docs } = await supabase
      .from("source_documents")
      .select("id, title, content, kind")
      .in("id", input.sourceDocumentIds)
      .eq("organization_id", ctx.organization.id)
      .eq("status", "ready");
    for (const doc of docs ?? []) {
      if (doc.content === null) {
        return {
          ok: false,
          message: `“${doc.title}” is a file source without extracted text yet — PDF extraction is not implemented in this phase.`,
        };
      }
      sources.push({
        sourceDocumentId: doc.id,
        title: doc.title,
        excerpt: doc.content.slice(0, 20_000),
      });
    }
    if (sources.length !== input.sourceDocumentIds.length) {
      return { ok: false, message: "One or more sources were not available." };
    }
  }

  const request = generationRequestSchema.safeParse({
    operation: input.operation,
    profile: input.profile,
    objective: input.objective,
    audience: input.audience,
    readingLevel: input.readingLevel,
    sources,
    inputText: input.inputText,
  });
  if (!request.success) {
    return { ok: false, message: "The generation request is invalid." };
  }

  const provider = getProvider();

  // 1. budget reservation (hard stop lives in SQL)
  const { data: generationId, error: reserveError } = await supabase.rpc(
    "reserve_ai_generation",
    {
      p_organization_id: ctx.organization.id,
      p_operation: input.operation,
      p_model_profile: input.profile,
      p_provider: provider.name,
      p_objective: input.objective,
      p_audience: input.audience,
      p_reading_level: input.readingLevel,
      p_source_document_ids: input.sourceDocumentIds,
    },
  );
  if (reserveError) {
    return {
      ok: false,
      message: reserveError.message.includes("budget exceeded")
        ? "The monthly AI budget has been reached. Generation is blocked until next month or a limit change."
        : reserveError.message,
    };
  }

  // 2. provider call + 3. output validation
  const result = await provider.generate(request.data);
  let settled: ActionState;
  if (!result.ok) {
    await supabase.rpc("settle_ai_generation", {
      p_generation_id: generationId as string,
      p_success: false,
      p_error: `${result.error.kind}: ${result.error.message}`,
    });
    settled = {
      ok: false,
      message: `Generation failed (${result.error.kind}): ${result.error.message}${result.error.retryable ? " You can try again." : ""}`,
    };
  } else {
    const validated = validateAiOutput(input.operation, result.output);
    if (!validated.ok) {
      await supabase.rpc("settle_ai_generation", {
        p_generation_id: generationId as string,
        p_success: false,
        p_error: `invalid_output: ${validated.error}`,
      });
      settled = {
        ok: false,
        message: `The provider's output failed validation and was discarded (${validated.error}).`,
      };
    } else {
      const { error: settleError } = await supabase.rpc(
        "settle_ai_generation",
        {
          p_generation_id: generationId as string,
          p_success: true,
          p_output: validated.output as never,
          p_provider_model: result.providerModel,
          p_input_tokens: Math.round(result.usage.inputTokens),
          p_output_tokens: Math.round(result.usage.outputTokens),
        },
      );
      settled = settleError
        ? { ok: false, message: dbErrorMessage(settleError) }
        : { ok: true, message: "Draft generated.", data: { generationId } };
    }
  }
  revalidatePath(`/${orgSlug}/admin/studio/ai`);
  return settled;
}

export async function rejectGenerationAction(
  orgSlug: string,
  generationId: string,
): Promise<ActionState> {
  await requireOrgContext(orgSlug);
  const supabase = await supabaseServer();
  const { error } = await supabase.rpc("resolve_ai_generation", {
    p_generation_id: generationId,
    p_accepted: false,
  });
  if (error) return { ok: false, message: error.message };
  revalidatePath(`/${orgSlug}/admin/studio/ai`);
  return { ok: true, message: "Output discarded." };
}

/**
 * Accept a completed generation and, where the operation produces
 * blocks or structure, APPLY it as new draft content:
 * - lesson_draft / source_to_blocks → new draft lesson in a module
 * - flashcards / knowledge_checks / scenario / reflection_prompts →
 *   blocks appended to a chosen draft lesson
 * - course_outline → draft course + modules + lesson stubs
 * - advisory operations (outlines of paths, suggestions, rewrites,
 *   summaries, gap analyses) → marked accepted; the author applies the
 *   text manually (documented limitation).
 */
export async function acceptGenerationAction(
  orgSlug: string,
  generationId: string,
  target: { lessonId?: string; moduleId?: string; courseId?: string },
): Promise<ActionState> {
  const ctx = await requireOrgContext(orgSlug);
  if (!can(ctx, "content.author")) {
    return { ok: false, message: "Applying drafts requires content.author." };
  }
  const supabase = await supabaseServer();
  const { data: generation } = await supabase
    .from("ai_generations")
    .select("id, operation, status, output")
    .eq("id", generationId)
    .eq("organization_id", ctx.organization.id)
    .maybeSingle();
  if (!generation || generation.status !== "completed") {
    return { ok: false, message: "That generation is not ready to accept." };
  }

  const user = await requireUser();
  let applied: ActionState = { ok: true };
  const op = generation.operation as AiOperation;

  if (op === "lesson_draft" || op === "source_to_blocks") {
    const parsed = lessonDraftSchema.safeParse(generation.output);
    if (!parsed.success)
      return { ok: false, message: "Stored output is invalid." };
    if (!target.moduleId || !target.courseId) {
      return { ok: false, message: "Choose a module for the new lesson." };
    }
    const { data: lastLesson } = await supabase
      .from("lessons")
      .select("position")
      .eq("module_id", target.moduleId)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    const { data: lesson, error: lessonError } = await supabase
      .from("lessons")
      .insert({
        organization_id: ctx.organization.id,
        course_id: target.courseId,
        module_id: target.moduleId,
        title: parsed.data.title,
        position: lastLesson ? `${lastLesson.position}n` : "a0",
        created_by: user.id,
      })
      .select("id")
      .single();
    if (lessonError) return { ok: false, message: dbErrorMessage(lessonError) };
    applied = await appendBlocksToLessonAction(
      orgSlug,
      lesson.id,
      parsed.data.blocks,
    );
  } else if (op === "knowledge_checks" || op === "assessment_questions") {
    const parsed = knowledgeChecksSchema.safeParse(generation.output);
    if (!parsed.success || !target.lessonId) {
      return { ok: false, message: "Choose a lesson to receive the checks." };
    }
    applied = await appendBlocksToLessonAction(
      orgSlug,
      target.lessonId,
      knowledgeChecksToBlocks(parsed.data),
    );
  } else if (op === "flashcards") {
    const parsed = flashcardDraftSchema.safeParse(generation.output);
    if (!parsed.success || !target.lessonId) {
      return {
        ok: false,
        message: "Choose a lesson to receive the flashcards.",
      };
    }
    applied = await appendBlocksToLessonAction(
      orgSlug,
      target.lessonId,
      flashcardsToBlocks(parsed.data),
    );
  } else if (op === "scenario") {
    const parsed = scenarioDraftSchema.safeParse(generation.output);
    if (!parsed.success || !target.lessonId) {
      return { ok: false, message: "Choose a lesson to receive the scenario." };
    }
    applied = await appendBlocksToLessonAction(
      orgSlug,
      target.lessonId,
      scenarioToBlocks(parsed.data),
    );
  } else if (op === "reflection_prompts") {
    const parsed = reflectionPromptsSchema.safeParse(generation.output);
    if (!parsed.success || !target.lessonId) {
      return { ok: false, message: "Choose a lesson to receive the prompts." };
    }
    applied = await appendBlocksToLessonAction(
      orgSlug,
      target.lessonId,
      reflectionsToBlocks(parsed.data),
    );
  } else if (op === "course_outline") {
    const parsed = courseOutlineSchema.safeParse(generation.output);
    if (!parsed.success)
      return { ok: false, message: "Stored output is invalid." };
    const slug = `ai-${generationId.slice(0, 8)}`;
    const { data: course, error: courseError } = await supabase
      .from("courses")
      .insert({
        organization_id: ctx.organization.id,
        slug,
        title: parsed.data.title,
        summary: parsed.data.summary.slice(0, 500),
        created_by: user.id,
      })
      .select("id")
      .single();
    if (courseError) return { ok: false, message: dbErrorMessage(courseError) };
    let modulePosition = "a0";
    for (const moduleDraft of parsed.data.modules) {
      const { data: module, error: moduleError } = await supabase
        .from("modules")
        .insert({
          organization_id: ctx.organization.id,
          course_id: course.id,
          title: moduleDraft.title,
          position: modulePosition,
        })
        .select("id")
        .single();
      if (moduleError)
        return { ok: false, message: dbErrorMessage(moduleError) };
      modulePosition = `${modulePosition}n`;
      let lessonPosition = "a0";
      for (const lessonDraft of moduleDraft.lessons) {
        const { error: lessonError } = await supabase.from("lessons").insert({
          organization_id: ctx.organization.id,
          course_id: course.id,
          module_id: module.id,
          title: lessonDraft.title,
          summary: lessonDraft.objective.slice(0, 500),
          position: lessonPosition,
          created_by: user.id,
        });
        if (lessonError)
          return { ok: false, message: dbErrorMessage(lessonError) };
        lessonPosition = `${lessonPosition}n`;
      }
    }
    applied = {
      ok: true,
      message: `Draft course “${parsed.data.title}” created.`,
    };
  }
  // advisory operations: acceptance is the record; the author applies text

  if (!applied.ok) return applied;

  const { error } = await supabase.rpc("resolve_ai_generation", {
    p_generation_id: generationId,
    p_accepted: true,
  });
  if (error) return { ok: false, message: error.message };
  revalidatePath(`/${orgSlug}/admin/studio/ai`);
  return {
    ok: true,
    message: applied.message ?? "Accepted — the output is now draft content.",
  };
}
