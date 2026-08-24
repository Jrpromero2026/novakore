"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  contentBlockSchema,
  pathLayoutSchema,
  validateBlockData,
  type BlockType,
} from "@novakore/domain";
import { can, requireOrgContext } from "../org-context";
import { requireUser } from "../auth";
import { supabaseServer } from "../supabase/server";
import { dbErrorMessage, type ActionState } from "./types";

/**
 * Studio actions: reusable content library, source documents, review
 * workflow, and path canvas layout. Domain validation first, can() for
 * UX, RLS + RPCs as the enforcement floor (ADR-006).
 */

// ---------------------------------------------------------------------------
// Reusable content library
// ---------------------------------------------------------------------------

export async function saveBlockToLibraryAction(
  orgSlug: string,
  input: {
    title: string;
    description?: string;
    blockType: BlockType;
    schemaVersion: number;
    data: unknown;
    tags: string[];
  },
): Promise<ActionState> {
  const ctx = await requireOrgContext(orgSlug);
  if (!can(ctx, "library.manage")) {
    return {
      ok: false,
      message: "Saving to the library requires library.manage.",
    };
  }
  const title = z.string().trim().min(2).max(200).safeParse(input.title);
  if (!title.success)
    return { ok: false, message: "Title must be 2–200 characters." };
  const validated = validateBlockData(
    input.blockType,
    input.schemaVersion,
    input.data,
  );
  if (!validated.ok) {
    return { ok: false, message: `The block is invalid: ${validated.error}` };
  }
  const tags = input.tags
    .map((t) => t.trim().toLowerCase())
    .filter((t) => /^[a-z0-9-]{1,30}$/.test(t))
    .slice(0, 10);

  const user = await requireUser();
  const supabase = await supabaseServer();
  const { data: row, error } = await supabase
    .from("reusable_blocks")
    .insert({
      organization_id: ctx.organization.id,
      title: title.data,
      description: input.description?.trim() || null,
      block_type: input.blockType,
      schema_version: input.schemaVersion,
      data: validated.data as never,
      tags,
      created_by: user.id,
      updated_by: user.id,
    })
    .select("id")
    .single();
  if (error) return { ok: false, message: dbErrorMessage(error) };

  await supabase.rpc("emit_studio_event", {
    p_organization_id: ctx.organization.id,
    p_type: "library.block.created",
    p_subject_kind: "reusable_block",
    p_subject_id: row.id,
    p_data: { block_type: input.blockType },
  });
  revalidatePath(`/${orgSlug}/admin/studio/library`);
  return { ok: true, message: "Saved to the library." };
}

/**
 * Insert a library block into a lesson draft. mode "link" keeps the
 * source reference (shared updates flow on next publish); "copy" creates
 * an independent local copy.
 */
export async function applyLibraryBlockAction(
  orgSlug: string,
  reusableBlockId: string,
  lessonId: string,
  mode: "link" | "copy",
): Promise<ActionState> {
  const ctx = await requireOrgContext(orgSlug);
  if (!can(ctx, "content.author")) {
    return { ok: false, message: "Editing lessons requires content.author." };
  }
  const supabase = await supabaseServer();
  const [{ data: source }, { data: lesson }, { data: lastBlock }] =
    await Promise.all([
      supabase
        .from("reusable_blocks")
        .select("id, block_type, schema_version, data, status, organization_id")
        .eq("id", reusableBlockId)
        .eq("organization_id", ctx.organization.id)
        .maybeSingle(),
      supabase
        .from("lessons")
        .select("id")
        .eq("id", lessonId)
        .eq("organization_id", ctx.organization.id)
        .maybeSingle(),
      supabase
        .from("content_blocks")
        .select("position")
        .eq("lesson_id", lessonId)
        .order("position", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
  if (!source || source.status !== "active") {
    return { ok: false, message: "That library block is not available." };
  }
  if (!lesson) return { ok: false, message: "Lesson not found." };

  const { error } = await supabase.from("content_blocks").insert({
    organization_id: ctx.organization.id,
    lesson_id: lessonId,
    block_type: source.block_type,
    schema_version: source.schema_version,
    data: source.data as never,
    position: lastBlock ? `${lastBlock.position}n` : "a0",
    source_reusable_block_id: mode === "link" ? source.id : null,
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };

  await supabase.rpc("emit_studio_event", {
    p_organization_id: ctx.organization.id,
    p_type: "library.block.used",
    p_subject_kind: "reusable_block",
    p_subject_id: reusableBlockId,
    p_context: { lesson_id: lessonId },
    p_data: { mode },
  });
  revalidatePath(`/${orgSlug}/admin/studio/library`);
  return {
    ok: true,
    message:
      mode === "link" ? "Linked into the lesson." : "Copied into the lesson.",
  };
}

export async function archiveLibraryBlockAction(
  orgSlug: string,
  reusableBlockId: string,
): Promise<ActionState> {
  const ctx = await requireOrgContext(orgSlug);
  if (!can(ctx, "library.manage")) {
    return { ok: false, message: "Archiving requires library.manage." };
  }
  const supabase = await supabaseServer();
  const { error } = await supabase
    .from("reusable_blocks")
    .update({ status: "archived", archived_at: new Date().toISOString() })
    .eq("id", reusableBlockId)
    .eq("organization_id", ctx.organization.id);
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath(`/${orgSlug}/admin/studio/library`);
  return { ok: true, message: "Archived." };
}

export async function updateLibraryBlockAction(
  orgSlug: string,
  reusableBlockId: string,
  data: unknown,
  blockType: BlockType,
  schemaVersion: number,
): Promise<ActionState> {
  const ctx = await requireOrgContext(orgSlug);
  if (!can(ctx, "library.manage")) {
    return { ok: false, message: "Updating requires library.manage." };
  }
  const validated = validateBlockData(blockType, schemaVersion, data);
  if (!validated.ok) {
    return { ok: false, message: `The block is invalid: ${validated.error}` };
  }
  const user = await requireUser();
  const supabase = await supabaseServer();
  const { error } = await supabase
    .from("reusable_blocks")
    .update({ data: validated.data as never, updated_by: user.id })
    .eq("id", reusableBlockId)
    .eq("organization_id", ctx.organization.id);
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath(`/${orgSlug}/admin/studio/library`);
  return {
    ok: true,
    message:
      "Updated — the version number was bumped. Linked drafts pick this up on their next publish.",
  };
}

// ---------------------------------------------------------------------------
// Source documents (text/markdown inline; file uploads with honest limits)
// ---------------------------------------------------------------------------

export async function createSourceDocumentAction(
  orgSlug: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireOrgContext(orgSlug);
  if (!can(ctx, "sources.manage")) {
    return { ok: false, message: "Managing sources requires sources.manage." };
  }
  const parsed = z
    .object({
      title: z.string().trim().min(2).max(200),
      kind: z.enum(["text", "markdown"]),
      content: z.string().trim().min(1).max(100_000),
      provenance: z.string().trim().max(500).optional(),
    })
    .safeParse({
      title: formData.get("title"),
      kind: formData.get("kind"),
      content: formData.get("content"),
      provenance: formData.get("provenance") || undefined,
    });
  if (!parsed.success) {
    return {
      ok: false,
      message: "Provide a title (2–200 chars) and content (≤100k chars).",
    };
  }
  const user = await requireUser();
  const supabase = await supabaseServer();
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(parsed.data.content),
  );
  const hash = [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const { data: row, error } = await supabase
    .from("source_documents")
    .insert({
      organization_id: ctx.organization.id,
      title: parsed.data.title,
      kind: parsed.data.kind,
      content: parsed.data.content,
      content_hash: hash,
      provenance: parsed.data.provenance ?? null,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error) return { ok: false, message: dbErrorMessage(error) };

  await supabase.rpc("emit_studio_event", {
    p_organization_id: ctx.organization.id,
    p_type: "content.source_document.created",
    p_subject_kind: "source_document",
    p_subject_id: row.id,
    p_data: { kind: parsed.data.kind },
  });
  revalidatePath(`/${orgSlug}/admin/studio/ai`);
  return { ok: true, message: "Source added." };
}

/**
 * File upload into the Source Workspace: the file lands in the
 * source-documents bucket, a source row records its metadata, and text
 * extraction runs where it is real (PDF, DOCX, TXT, MD, CSV). Images and
 * video are stored without claimed text — the extraction note says so.
 */
export async function uploadSourceFileAction(
  orgSlug: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireOrgContext(orgSlug);
  if (!can(ctx, "sources.manage")) {
    return { ok: false, message: "Managing sources requires sources.manage." };
  }
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: "Choose a file to upload." };
  }
  const { SOURCE_UPLOAD_LIMITS, extractSourceText } =
    await import("../ai/extract");
  const limit = SOURCE_UPLOAD_LIMITS[file.type];
  if (limit === undefined) {
    return {
      ok: false,
      message:
        "Unsupported file type. Accepted: PDF, DOCX, TXT, MD, CSV, PNG, JPEG, WEBP, MP4, WEBM, MOV.",
    };
  }
  if (file.size > limit) {
    return {
      ok: false,
      message: `That file is ${(file.size / 1_048_576).toFixed(1)}MB — the limit for its type is ${Math.round(limit / 1_048_576)}MB.`,
    };
  }
  const titleInput = z
    .string()
    .trim()
    .min(2)
    .max(200)
    .safeParse(formData.get("title") || file.name.slice(0, 200));
  if (!titleInput.success) {
    return { ok: false, message: "Provide a title (2–200 characters)." };
  }
  const provenance = z
    .string()
    .trim()
    .max(500)
    .optional()
    .safeParse(formData.get("provenance") || undefined);

  const user = await requireUser();
  const supabase = await supabaseServer();

  const extension = (file.name.split(".").pop() ?? "bin")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 10);
  const objectName = `${crypto.randomUUID()}.${extension || "bin"}`;
  const storagePath = `organizations/${ctx.organization.id}/sources/${objectName}`;

  const bytes = new Uint8Array(await file.arrayBuffer());
  const { error: uploadError } = await supabase.storage
    .from("source-documents")
    .upload(storagePath, bytes, { contentType: file.type, upsert: false });
  if (uploadError) {
    return { ok: false, message: `Upload failed: ${uploadError.message}` };
  }

  const extraction = await extractSourceText(bytes, file.type);
  let contentHash: string | null = null;
  if (extraction.text !== null) {
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(extraction.text),
    );
    contentHash = [...new Uint8Array(digest)]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  const { data: row, error } = await supabase
    .from("source_documents")
    .insert({
      organization_id: ctx.organization.id,
      title: titleInput.data,
      kind: "file",
      storage_path: storagePath,
      content: extraction.text,
      content_hash: contentHash,
      mime_type: file.type,
      byte_size: file.size,
      original_filename: file.name.slice(0, 200),
      extraction_status: extraction.status,
      extraction_note: extraction.note,
      extracted_chars: extraction.extractedChars,
      provenance: provenance.success ? (provenance.data ?? null) : null,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error) {
    // The row is the source of record — without it the object is orphaned.
    await supabase.storage.from("source-documents").remove([storagePath]);
    return { ok: false, message: dbErrorMessage(error) };
  }

  await supabase.rpc("emit_studio_event", {
    p_organization_id: ctx.organization.id,
    p_type: "content.source_document.created",
    p_subject_kind: "source_document",
    p_subject_id: row.id,
    p_data: { kind: "file", mime_type: file.type },
  });
  revalidatePath(`/${orgSlug}/admin/studio/sources`);
  revalidatePath(`/${orgSlug}/admin/studio/ai`);
  return {
    ok: true,
    message:
      extraction.status === "extracted"
        ? `Uploaded — ${(extraction.extractedChars ?? 0).toLocaleString()} characters of text extracted.`
        : extraction.status === "not_needed"
          ? "Uploaded and stored."
          : `Uploaded, but extraction did not produce text: ${extraction.note ?? "no detail"}`,
  };
}

export async function archiveSourceDocumentAction(
  orgSlug: string,
  sourceId: string,
): Promise<ActionState> {
  const ctx = await requireOrgContext(orgSlug);
  if (!can(ctx, "sources.manage")) {
    return { ok: false, message: "Managing sources requires sources.manage." };
  }
  const supabase = await supabaseServer();
  const { error } = await supabase
    .from("source_documents")
    .update({ status: "archived", archived_at: new Date().toISOString() })
    .eq("id", sourceId)
    .eq("organization_id", ctx.organization.id);
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath(`/${orgSlug}/admin/studio/sources`);
  revalidatePath(`/${orgSlug}/admin/studio/ai`);
  return { ok: true, message: "Source archived." };
}

export async function approveSourceDocumentAction(
  orgSlug: string,
  sourceId: string,
): Promise<ActionState> {
  const ctx = await requireOrgContext(orgSlug);
  if (!can(ctx, "sources.manage")) {
    return { ok: false, message: "Managing sources requires sources.manage." };
  }
  const supabase = await supabaseServer();
  const { error } = await supabase
    .from("source_documents")
    .update({ review_state: "approved" })
    .eq("id", sourceId)
    .eq("organization_id", ctx.organization.id);
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath(`/${orgSlug}/admin/studio/ai`);
  return { ok: true, message: "Source approved." };
}

// ---------------------------------------------------------------------------
// Review workflow
// ---------------------------------------------------------------------------

export async function requestReviewAction(
  orgSlug: string,
  subjectType: "lesson" | "course" | "assessment",
  subjectId: string,
  note: string,
): Promise<ActionState> {
  const ctx = await requireOrgContext(orgSlug);
  const supabase = await supabaseServer();
  const { error } = await supabase.rpc("request_review", {
    p_organization_id: ctx.organization.id,
    p_subject_type: subjectType,
    p_subject_id: subjectId,
    p_note: note.trim() === "" ? undefined : note.trim(),
  });
  if (error) return { ok: false, message: error.message };
  revalidatePath(`/${orgSlug}/admin/studio/review`);
  return { ok: true, message: "Review requested." };
}

export async function decideReviewAction(
  orgSlug: string,
  requestId: string,
  decision: "approved" | "changes_requested" | "closed",
  note: string,
): Promise<ActionState> {
  await requireOrgContext(orgSlug);
  const supabase = await supabaseServer();
  const { error } = await supabase.rpc("decide_review", {
    p_request_id: requestId,
    p_decision: decision,
    p_note: note.trim() === "" ? undefined : note.trim(),
  });
  if (error) return { ok: false, message: error.message };
  revalidatePath(`/${orgSlug}/admin/studio/review`);
  return { ok: true, message: `Review ${decision.replace(/_/g, " ")}.` };
}

export async function addReviewCommentAction(
  orgSlug: string,
  requestId: string,
  body: string,
): Promise<ActionState> {
  const ctx = await requireOrgContext(orgSlug);
  const trimmed = body.trim();
  if (trimmed.length === 0 || trimmed.length > 4000) {
    return { ok: false, message: "Comments must be 1–4000 characters." };
  }
  const user = await requireUser();
  const supabase = await supabaseServer();
  const { error } = await supabase.from("review_comments").insert({
    organization_id: ctx.organization.id,
    request_id: requestId,
    author_id: user.id,
    body: trimmed,
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath(`/${orgSlug}/admin/studio/review`);
  return { ok: true, message: "Comment added." };
}

export async function setCommentStatusAction(
  orgSlug: string,
  commentId: string,
  status: "open" | "resolved",
): Promise<ActionState> {
  const ctx = await requireOrgContext(orgSlug);
  const supabase = await supabaseServer();
  const { error } = await supabase
    .from("review_comments")
    .update({ status })
    .eq("id", commentId)
    .eq("organization_id", ctx.organization.id);
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath(`/${orgSlug}/admin/studio/review`);
  return { ok: true };
}

export async function removePathNodeAction(
  orgSlug: string,
  nodeId: string,
): Promise<ActionState> {
  const ctx = await requireOrgContext(orgSlug);
  if (!can(ctx, "paths.manage")) {
    return { ok: false, message: "Editing paths requires paths.manage." };
  }
  const supabase = await supabaseServer();
  const { error } = await supabase
    .from("path_nodes")
    .delete()
    .eq("id", nodeId)
    .eq("organization_id", ctx.organization.id);
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath(`/${orgSlug}/admin/studio/paths`);
  return { ok: true, message: "Node removed." };
}

// ---------------------------------------------------------------------------
// Path canvas layout (presentation only)
// ---------------------------------------------------------------------------

export async function savePathLayoutAction(
  orgSlug: string,
  pathId: string,
  layout: unknown,
): Promise<ActionState> {
  const ctx = await requireOrgContext(orgSlug);
  if (!can(ctx, "paths.manage")) {
    return { ok: false, message: "Saving layouts requires paths.manage." };
  }
  const parsed = pathLayoutSchema.safeParse(layout);
  if (!parsed.success) return { ok: false, message: "That layout is invalid." };
  const user = await requireUser();
  const supabase = await supabaseServer();
  const { error } = await supabase.from("path_layouts").upsert({
    path_id: pathId,
    organization_id: ctx.organization.id,
    layout: parsed.data as never,
    updated_by: user.id,
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  return { ok: true, message: "Layout saved." };
}

// ---------------------------------------------------------------------------
// Studio telemetry (bounded; never per-keystroke)
// ---------------------------------------------------------------------------

export async function recordStudioEventAction(
  orgSlug: string,
  type: "studio.session.opened" | "content.lesson.previewed",
  subjectId: string,
): Promise<void> {
  const ctx = await requireOrgContext(orgSlug);
  const supabase = await supabaseServer();
  await supabase.rpc("emit_studio_event", {
    p_organization_id: ctx.organization.id,
    p_type: type,
    p_subject_kind:
      type === "studio.session.opened" ? "organization" : "lesson",
    p_subject_id: subjectId,
  });
}

/** Applied AI drafts land as real validated draft blocks (never publish). */
export async function appendBlocksToLessonAction(
  orgSlug: string,
  lessonId: string,
  blocks: unknown[],
): Promise<ActionState> {
  const ctx = await requireOrgContext(orgSlug);
  if (!can(ctx, "content.author")) {
    return { ok: false, message: "Editing lessons requires content.author." };
  }
  const supabase = await supabaseServer();
  const { data: lesson } = await supabase
    .from("lessons")
    .select("id")
    .eq("id", lessonId)
    .eq("organization_id", ctx.organization.id)
    .maybeSingle();
  if (!lesson) return { ok: false, message: "Lesson not found." };
  const { data: lastBlock } = await supabase
    .from("content_blocks")
    .select("position")
    .eq("lesson_id", lessonId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  let position = lastBlock ? `${lastBlock.position}n` : "a0";
  for (const raw of blocks) {
    const parsed = contentBlockSchema.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        message: "A generated block failed validation; nothing was inserted.",
      };
    }
    const { error } = await supabase.from("content_blocks").insert({
      id: crypto.randomUUID(), // fresh identity per insertion
      organization_id: ctx.organization.id,
      lesson_id: lessonId,
      block_type: parsed.data.type,
      schema_version: parsed.data.schemaVersion,
      data: parsed.data.data as never,
      position,
    });
    if (error) return { ok: false, message: dbErrorMessage(error) };
    position = `${position}n`;
  }
  revalidatePath(`/${orgSlug}/admin/studio`);
  return {
    ok: true,
    message: `Inserted ${blocks.length} block(s) into the draft.`,
  };
}
