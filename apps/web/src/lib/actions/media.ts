"use server";

import { revalidatePath } from "next/cache";
import { can, requireOrgContext } from "../org-context";
import { requireUser } from "../auth";
import { supabaseServer } from "../supabase/server";
import { dbErrorMessage, type ActionState } from "./types";

/**
 * Lesson media uploads (ADR-015 applied to Studio content). Private
 * bucket, deterministic tenant paths, MIME + size enforced here AND at
 * the bucket AND by policy. No SVG — the branding gate is the only SVG
 * path on the platform.
 */

const LESSON_MEDIA_RULES: Record<
  string,
  { kind: "lesson_image" | "lesson_audio" | "lesson_pdf"; maxBytes: number }
> = {
  "image/png": { kind: "lesson_image", maxBytes: 10_000_000 },
  "image/jpeg": { kind: "lesson_image", maxBytes: 10_000_000 },
  "image/webp": { kind: "lesson_image", maxBytes: 10_000_000 },
  "audio/mpeg": { kind: "lesson_audio", maxBytes: 50_000_000 },
  "audio/mp4": { kind: "lesson_audio", maxBytes: 50_000_000 },
  "application/pdf": { kind: "lesson_pdf", maxBytes: 50_000_000 },
};

function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "file";
  const cleaned = base
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^[.-]+/, "")
    .slice(0, 120);
  return cleaned.length > 0 ? cleaned : "file";
}

export async function uploadLessonMediaAction(
  orgSlug: string,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireOrgContext(orgSlug);
  if (!can(ctx, "content.author")) {
    return { ok: false, message: "Uploading media requires content.author." };
  }
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: "Choose a file to upload." };
  }
  const rule = LESSON_MEDIA_RULES[file.type];
  if (!rule) {
    return {
      ok: false,
      message:
        "Allowed types: PNG, JPEG, WebP, MP3, M4A, PDF. (SVG is never accepted here.)",
    };
  }
  if (file.size > rule.maxBytes) {
    return {
      ok: false,
      message: `That file is too large (limit ${(rule.maxBytes / 1_000_000).toFixed(0)} MB).`,
    };
  }

  const user = await requireUser();
  const supabase = await supabaseServer();
  const fileName = sanitizeFilename(file.name);
  const path = `organizations/${ctx.organization.id}/lesson-media/${crypto.randomUUID()}-${fileName}`;

  const { error: uploadError } = await supabase.storage
    .from("lesson-media")
    .upload(path, file, { contentType: file.type, upsert: false });
  if (uploadError) {
    return { ok: false, message: `Upload failed: ${uploadError.message}` };
  }

  const { data: asset, error: metaError } = await supabase
    .from("media_assets")
    .insert({
      organization_id: ctx.organization.id,
      owner_user_id: user.id,
      asset_kind: rule.kind,
      storage_bucket: "lesson-media",
      storage_path: path,
      original_filename: fileName,
      mime_type: file.type,
      byte_size: file.size,
      status: "active",
      created_by: user.id,
    })
    .select("id")
    .single();
  if (metaError) {
    // orphan-prevention: remove the object when metadata fails
    await supabase.storage.from("lesson-media").remove([path]);
    return { ok: false, message: dbErrorMessage(metaError) };
  }

  await supabase.rpc("emit_studio_event", {
    p_organization_id: ctx.organization.id,
    p_type: "media.asset.uploaded",
    p_subject_kind: "media_asset",
    p_subject_id: asset.id,
    p_data: { kind: rule.kind, bytes: file.size },
  });

  revalidatePath(`/${orgSlug}/admin/studio`);
  return {
    ok: true,
    message: "Uploaded.",
    data: { assetId: asset.id, fileName },
  };
}
