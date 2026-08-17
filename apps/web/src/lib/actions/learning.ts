"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  contentBlockSchema,
  courseStructureSchema,
  wouldCreateCycle,
  type ProgressStatus,
} from "@novakore/domain";
import { can, requireOrgContext } from "../org-context";
import { invalidateOrg } from "../cache";
import { requireUser } from "../auth";
import { supabaseServer } from "../supabase/server";
import { slugSchema } from "../validation";
import { dbErrorMessage, fieldErrors, type ActionState } from "./types";

/**
 * Learning actions (D-08 contract). Hard invariants live in the database
 * RPCs; the single domain computation gates deterministic sequencing here
 * on the server before any progress call.
 */

const titled = z.object({
  title: z
    .string()
    .trim()
    .min(2, { error: "Title must be at least 2 characters." })
    .max(200),
});

// ---------------------------------------------------------------------------
// Learning systems + paths + prerequisites
// ---------------------------------------------------------------------------

export async function createLearningSystemAction(
  orgSlug: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireOrgContext(orgSlug);
  if (!can(ctx, "paths.manage")) {
    return {
      ok: false,
      message: "You do not have permission to manage learning systems.",
    };
  }
  const parsed = titled.extend({ slug: slugSchema }).safeParse({
    title: formData.get("title"),
    slug: formData.get("slug"),
  });
  if (!parsed.success) return fieldErrors(parsed.error);

  const supabase = await supabaseServer();
  const { data: academy } = await supabase
    .from("academies")
    .select("id")
    .eq("organization_id", ctx.organization.id)
    .neq("status", "archived")
    .limit(1)
    .maybeSingle();
  if (!academy) return { ok: false, message: "Create an academy first." };

  const user = await requireUser();
  const { error } = await supabase.from("learning_systems").insert({
    organization_id: ctx.organization.id,
    academy_id: academy.id,
    slug: parsed.data.slug,
    title: parsed.data.title,
    status: "active",
    created_by: user.id,
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath(`/${orgSlug}/admin/learning`);
  return { ok: true, message: "Learning system created." };
}

export async function createLearningPathAction(
  orgSlug: string,
  learningSystemId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireOrgContext(orgSlug);
  if (!can(ctx, "paths.manage")) {
    return {
      ok: false,
      message: "You do not have permission to manage paths.",
    };
  }
  const parsed = titled.extend({ slug: slugSchema }).safeParse({
    title: formData.get("title"),
    slug: formData.get("slug"),
  });
  if (!parsed.success) return fieldErrors(parsed.error);

  const supabase = await supabaseServer();
  const { data: system } = await supabase
    .from("learning_systems")
    .select("id, academy_id")
    .eq("id", learningSystemId)
    .eq("organization_id", ctx.organization.id)
    .maybeSingle();
  if (!system) return { ok: false, message: "Learning system not found." };

  const user = await requireUser();
  const { error } = await supabase.from("learning_paths").insert({
    organization_id: ctx.organization.id,
    academy_id: system.academy_id,
    learning_system_id: system.id,
    slug: parsed.data.slug,
    title: parsed.data.title,
    status: "active",
    created_by: user.id,
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  // The author is about to look for this; do not make them wait out the TTL.
  invalidateOrg(ctx.organization.id);
  revalidatePath(`/${orgSlug}/admin/learning`);
  return { ok: true, message: "Learning path created." };
}

export async function addPathNodeAction(
  orgSlug: string,
  pathId: string,
  courseId: string,
): Promise<ActionState> {
  const ctx = await requireOrgContext(orgSlug);
  if (!can(ctx, "paths.manage")) {
    return {
      ok: false,
      message: "You do not have permission to manage paths.",
    };
  }
  const supabase = await supabaseServer();
  const { data: last } = await supabase
    .from("path_nodes")
    .select("position")
    .eq("path_id", pathId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const position = last ? `${last.position}n` : "a0";

  const { error } = await supabase.from("path_nodes").insert({
    organization_id: ctx.organization.id,
    path_id: pathId,
    course_id: courseId,
    position,
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath(`/${orgSlug}/admin/learning`);
  return { ok: true };
}

export async function addPrerequisiteAction(
  orgSlug: string,
  pathId: string,
  nodeId: string,
  requiresNodeId: string,
): Promise<ActionState> {
  const ctx = await requireOrgContext(orgSlug);
  if (!can(ctx, "paths.manage")) {
    return {
      ok: false,
      message: "You do not have permission to manage paths.",
    };
  }
  const supabase = await supabaseServer();
  // Advisory pre-check with the shared domain algorithm (the DB trigger is
  // authoritative and re-checks in the same transaction).
  const { data: edges } = await supabase
    .from("prerequisites")
    .select("node_id, requires_node_id")
    .eq("path_id", pathId);
  if (
    wouldCreateCycle(
      (edges ?? []).map((e) => ({
        nodeId: e.node_id,
        requiresNodeId: e.requires_node_id,
      })),
      { nodeId, requiresNodeId },
    )
  ) {
    return { ok: false, message: "That prerequisite would create a cycle." };
  }

  const { error } = await supabase.from("prerequisites").insert({
    organization_id: ctx.organization.id,
    path_id: pathId,
    node_id: nodeId,
    requires_node_id: requiresNodeId,
  });
  if (error) {
    return {
      ok: false,
      message: error.message.includes("cycle")
        ? "That prerequisite would create a cycle."
        : dbErrorMessage(error),
    };
  }
  revalidatePath(`/${orgSlug}/admin/learning`);
  return { ok: true };
}

export async function removePrerequisiteAction(
  orgSlug: string,
  prerequisiteId: string,
): Promise<ActionState> {
  const ctx = await requireOrgContext(orgSlug);
  if (!can(ctx, "paths.manage")) {
    return {
      ok: false,
      message: "You do not have permission to manage paths.",
    };
  }
  const supabase = await supabaseServer();
  const { error } = await supabase
    .from("prerequisites")
    .delete()
    .eq("id", prerequisiteId)
    .eq("organization_id", ctx.organization.id);
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath(`/${orgSlug}/admin/learning`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Courses / modules / lessons / blocks (draft authoring)
// ---------------------------------------------------------------------------

export async function createCourseAction(
  orgSlug: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireOrgContext(orgSlug);
  if (!can(ctx, "content.author")) {
    return {
      ok: false,
      message: "You do not have permission to author content.",
    };
  }
  const parsed = titled.extend({ slug: slugSchema }).safeParse({
    title: formData.get("title"),
    slug: formData.get("slug"),
  });
  if (!parsed.success) return fieldErrors(parsed.error);

  const user = await requireUser();
  const supabase = await supabaseServer();
  const { data, error } = await supabase
    .from("courses")
    .insert({
      organization_id: ctx.organization.id,
      slug: parsed.data.slug,
      title: parsed.data.title,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error) return { ok: false, message: dbErrorMessage(error) };
  // The author is about to look for this; do not make them wait out the TTL.
  invalidateOrg(ctx.organization.id);
  revalidatePath(`/${orgSlug}/admin/courses`);
  return { ok: true, message: `Course created.`, warnings: [data!.id] };
}

async function nextPosition(
  table: "modules" | "lessons" | "content_blocks",
  column: "course_id" | "module_id" | "lesson_id",
  parentId: string,
): Promise<string> {
  const supabase = await supabaseServer();
  const { data: last } = await supabase
    .from(table)
    .select("position")
    .match({ [column]: parentId })
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  return last ? `${last.position}n` : "a0";
}

export async function createModuleAction(
  orgSlug: string,
  courseId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireOrgContext(orgSlug);
  if (!can(ctx, "content.author")) {
    return {
      ok: false,
      message: "You do not have permission to author content.",
    };
  }
  const parsed = titled.safeParse({ title: formData.get("title") });
  if (!parsed.success) return fieldErrors(parsed.error);

  const supabase = await supabaseServer();
  const { error } = await supabase.from("modules").insert({
    organization_id: ctx.organization.id,
    course_id: courseId,
    title: parsed.data.title,
    position: await nextPosition("modules", "course_id", courseId),
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath(`/${orgSlug}/admin/courses/${courseId}`);
  return { ok: true, message: "Module added." };
}

export async function createLessonAction(
  orgSlug: string,
  courseId: string,
  moduleId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireOrgContext(orgSlug);
  if (!can(ctx, "content.author")) {
    return {
      ok: false,
      message: "You do not have permission to author content.",
    };
  }
  const parsed = titled.safeParse({ title: formData.get("title") });
  if (!parsed.success) return fieldErrors(parsed.error);

  const user = await requireUser();
  const supabase = await supabaseServer();
  const { error } = await supabase.from("lessons").insert({
    organization_id: ctx.organization.id,
    course_id: courseId,
    module_id: moduleId,
    title: parsed.data.title,
    position: await nextPosition("lessons", "module_id", moduleId),
    created_by: user.id,
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  // The author is about to look for this; do not make them wait out the TTL.
  invalidateOrg(ctx.organization.id);
  revalidatePath(`/${orgSlug}/admin/courses/${courseId}`);
  return { ok: true, message: "Lesson added." };
}

/** Accessible reordering (no drag-and-drop required): swap position keys. */
export async function swapPositionsAction(
  orgSlug: string,
  table: "modules" | "lessons" | "path_nodes",
  idA: string,
  idB: string,
): Promise<ActionState> {
  const ctx = await requireOrgContext(orgSlug);
  const permission = table === "path_nodes" ? "paths.manage" : "content.author";
  if (!can(ctx, permission)) {
    return { ok: false, message: "You do not have permission to reorder." };
  }
  const supabase = await supabaseServer();
  const { data: rows, error } = await supabase
    .from(table)
    .select("id, position")
    .in("id", [idA, idB])
    .eq("organization_id", ctx.organization.id);
  if (error || rows?.length !== 2)
    return { ok: false, message: "Could not reorder." };

  const [a, b] = rows;
  // Two-step swap through a temp key (unique constraints are deferred, but
  // supabase-js runs statements separately — use a disjoint temp value).
  const temp = `${a!.position}~swap`;
  await supabase.from(table).update({ position: temp }).eq("id", a!.id);
  await supabase.from(table).update({ position: a!.position }).eq("id", b!.id);
  const { error: finalError } = await supabase
    .from(table)
    .update({ position: b!.position })
    .eq("id", a!.id);
  if (finalError) return { ok: false, message: dbErrorMessage(finalError) };
  revalidatePath(`/${orgSlug}/admin`, "layout");
  return { ok: true };
}

const blocksPayloadSchema = z.array(contentBlockSchema).max(100);

/** Replace a lesson draft's blocks (validated by the domain registry). */
export async function saveLessonBlocksAction(
  orgSlug: string,
  lessonId: string,
  input: unknown,
): Promise<ActionState> {
  const ctx = await requireOrgContext(orgSlug);
  if (!can(ctx, "content.author")) {
    return {
      ok: false,
      message: "You do not have permission to author content.",
    };
  }
  const parsed = blocksPayloadSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: `Invalid blocks: ${parsed.error.issues[0]?.message ?? "validation failed"}. Nothing was saved.`,
    };
  }
  const positions = new Set(parsed.data.map((b) => b.position));
  if (positions.size !== parsed.data.length) {
    return {
      ok: false,
      message: "Duplicate block positions. Nothing was saved.",
    };
  }

  const supabase = await supabaseServer();
  const { data: lesson } = await supabase
    .from("lessons")
    .select("id, course_id")
    .eq("id", lessonId)
    .eq("organization_id", ctx.organization.id)
    .maybeSingle();
  if (!lesson) return { ok: false, message: "Lesson not found." };

  const { error: deleteError } = await supabase
    .from("content_blocks")
    .delete()
    .eq("lesson_id", lessonId);
  if (deleteError) return { ok: false, message: dbErrorMessage(deleteError) };

  if (parsed.data.length > 0) {
    const { error: insertError } = await supabase.from("content_blocks").insert(
      parsed.data.map((b) => ({
        id: b.id,
        organization_id: ctx.organization.id,
        lesson_id: lessonId,
        block_type: b.type,
        schema_version: b.schemaVersion,
        data: b.data,
        position: b.position,
      })),
    );
    if (insertError) return { ok: false, message: dbErrorMessage(insertError) };
  }
  revalidatePath(
    `/${orgSlug}/admin/courses/${lesson.course_id}/lessons/${lessonId}`,
  );
  return { ok: true, message: "Draft saved." };
}

// ---------------------------------------------------------------------------
// Publishing (server re-validates; DB RPC is transactional + permission-gated)
// ---------------------------------------------------------------------------

export async function publishLessonAction(
  orgSlug: string,
  lessonId: string,
): Promise<ActionState> {
  const ctx = await requireOrgContext(orgSlug);
  if (!can(ctx, "content.publish")) {
    return {
      ok: false,
      message: "Publishing requires the publish permission.",
    };
  }
  const supabase = await supabaseServer();
  // Deep-validate every draft block with the domain registry pre-publication.
  const { data: blocks } = await supabase
    .from("content_blocks")
    .select("id, block_type, schema_version, data, position")
    .eq("lesson_id", lessonId)
    .order("position");
  for (const b of blocks ?? []) {
    const check = contentBlockSchema.safeParse({
      id: b.id,
      type: b.block_type,
      schemaVersion: b.schema_version,
      data: b.data,
      position: b.position,
    });
    if (!check.success) {
      return {
        ok: false,
        message: `Publish blocked: a ${b.block_type} block is invalid (${check.error.issues[0]?.message}).`,
      };
    }
  }

  const { error } = await supabase.rpc("publish_lesson", {
    p_lesson_id: lessonId,
  });
  if (error) return { ok: false, message: error.message };
  // The author is about to look for this; do not make them wait out the TTL.
  invalidateOrg(ctx.organization.id);
  revalidatePath(`/${orgSlug}/admin`, "layout");
  return { ok: true, message: "Lesson published." };
}

export async function publishCourseAction(
  orgSlug: string,
  courseId: string,
): Promise<ActionState> {
  const ctx = await requireOrgContext(orgSlug);
  if (!can(ctx, "content.publish")) {
    return {
      ok: false,
      message: "Publishing requires the publish permission.",
    };
  }
  const supabase = await supabaseServer();
  const { data: versionId, error } = await supabase.rpc("publish_course", {
    p_course_id: courseId,
  });
  if (error) return { ok: false, message: error.message };

  // Post-publication sanity: the stored snapshot must satisfy the domain schema.
  const { data: version } = await supabase
    .from("course_versions")
    .select("structure, version_number")
    .eq("id", versionId as string)
    .single();
  const valid = courseStructureSchema.safeParse(version?.structure);
  if (!valid.success) {
    return {
      ok: false,
      message:
        "Published structure failed validation — investigate before use.",
    };
  }
  // The author is about to look for this; do not make them wait out the TTL.
  invalidateOrg(ctx.organization.id);
  revalidatePath(`/${orgSlug}/admin`, "layout");
  return { ok: true, message: `Published version ${version!.version_number}.` };
}

// ---------------------------------------------------------------------------
// Enrollment + progress
// ---------------------------------------------------------------------------

export async function createEnrollmentAction(
  orgSlug: string,
  input: {
    membershipId: string;
    targetType: "course" | "learning_path";
    targetId: string;
  },
): Promise<ActionState> {
  const ctx = await requireOrgContext(orgSlug);
  if (!can(ctx, "enrollment.manage")) {
    return {
      ok: false,
      message: "You do not have permission to manage enrollments.",
    };
  }
  const supabase = await supabaseServer();
  const { error } = await supabase.rpc("create_enrollment", {
    p_membership_id: input.membershipId,
    p_target_type: input.targetType,
    p_target_id: input.targetId,
    p_source: "assigned",
  });
  if (error) return { ok: false, message: error.message };
  revalidatePath(`/${orgSlug}/admin/enrollments`);
  return { ok: true, message: "Enrollment created (version pinned)." };
}

export async function setEnrollmentStatusAction(
  orgSlug: string,
  enrollmentId: string,
  status: "active" | "withdrawn" | "expired",
): Promise<ActionState> {
  const ctx = await requireOrgContext(orgSlug);
  if (!can(ctx, "enrollment.manage")) {
    return {
      ok: false,
      message: "You do not have permission to manage enrollments.",
    };
  }
  const supabase = await supabaseServer();
  const { error } = await supabase.rpc("set_enrollment_status", {
    p_enrollment_id: enrollmentId,
    p_status: status,
  });
  if (error) return { ok: false, message: error.message };
  revalidatePath(`/${orgSlug}/admin/enrollments`);
  return { ok: true };
}

/**
 * Learner progress. Deterministic sequence gating runs HERE through the
 * single domain computation; the RPC enforces the hard invariants.
 */
export async function recordProgressAction(
  orgSlug: string,
  enrollmentId: string,
  courseId: string,
  lessonId: string,
  action: "start" | "complete",
): Promise<ActionState> {
  const ctx = await requireOrgContext(orgSlug); // active membership required
  void ctx;
  const user = await requireUser();
  const { getEnrolledCourse } = await import("../data/learning");
  const view = await getEnrolledCourse(enrollmentId, courseId, user.id);
  if (view === null) return { ok: false, message: "Enrollment not found." };
  if (view === "version_unavailable") {
    return {
      ok: false,
      message: "No published version is available for this course.",
    };
  }
  const access = view.access.find((a) => a.lessonId === lessonId);
  if (!access)
    return {
      ok: false,
      message: "This lesson is not part of your assigned version.",
    };
  if (access.state === "locked_by_sequence") {
    return { ok: false, message: access.reason ?? "This lesson is locked." };
  }
  if (access.state === "not_enrolled") {
    return { ok: false, message: "This enrollment is no longer active." };
  }

  const supabase = await supabaseServer();
  const { error } = await supabase.rpc("record_lesson_progress", {
    p_enrollment_id: enrollmentId,
    p_lesson_id: lessonId,
    p_action: action,
  });
  if (error) return { ok: false, message: error.message };
  revalidatePath(`/${orgSlug}/learn`, "layout");
  return {
    ok: true,
    message: action === "complete" ? "Lesson completed." : undefined,
  };
}

export async function overrideProgressAction(
  orgSlug: string,
  input: {
    enrollmentId: string;
    lessonId: string;
    status: Extract<ProgressStatus, "completed" | "exempted">;
    reason: string;
  },
): Promise<ActionState> {
  const ctx = await requireOrgContext(orgSlug);
  if (!can(ctx, "progress.override")) {
    return {
      ok: false,
      message: "Overrides require the progress.override permission.",
    };
  }
  const supabase = await supabaseServer();
  const { error } = await supabase.rpc("override_progress", {
    p_enrollment_id: input.enrollmentId,
    p_lesson_id: input.lessonId,
    p_status: input.status,
    p_reason: input.reason,
  });
  if (error) return { ok: false, message: error.message };
  revalidatePath(`/${orgSlug}/admin/enrollments`);
  return { ok: true, message: "Progress overridden (audited)." };
}
