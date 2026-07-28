"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { imageSize } from "image-size";
import {
  BRANDING_ASSET_KINDS,
  brandingStoragePath,
  evaluateThemeContrast,
  sanitizeFilename,
  tenantThemeSchema,
  themeHasBlockingContrast,
  validateAssetUpload,
  type AssetKind,
} from "@novakore/domain";
import { mimeAgreesWithBytes, validateSvgContent } from "../asset-security";
import { can, requireOrgContext } from "../org-context";
import { requireUser } from "../auth";
import { supabaseServer } from "../supabase/server";
import { dbErrorMessage, type ActionState } from "./types";

/**
 * Brand actions follow the D-08 mutating-path contract: validate →
 * authenticate → resolve org → can() → operate under the caller's RLS
 * session (storage AND relational policies enforce beneath) → audited by
 * database triggers → typed results with safe error translation.
 */

// ---------------------------------------------------------------------------
// Theme draft / publish / revert
// ---------------------------------------------------------------------------

export async function saveBrandDraftAction(
  orgSlug: string,
  input: unknown,
): Promise<ActionState> {
  const ctx = await requireOrgContext(orgSlug);
  if (!can(ctx, "org.branding.manage")) {
    return {
      ok: false,
      message: "You do not have permission to edit branding.",
    };
  }
  const user = await requireUser();

  const parsed = tenantThemeSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: "The theme contains invalid values. Nothing was saved.",
    };
  }

  const supabase = await supabaseServer();
  const { error } = await supabase
    .from("organization_branding")
    .update({
      theme_draft: parsed.data,
      draft_updated_at: new Date().toISOString(),
      draft_updated_by: user.id,
    })
    .eq("organization_id", ctx.organization.id);
  if (error) return { ok: false, message: dbErrorMessage(error) };

  revalidatePath(`/${orgSlug}/admin/branding`);
  const warnings = evaluateThemeContrast(parsed.data)
    .filter((i) => i.level === "warning")
    .map(
      (i) =>
        `${i.mode}: ${i.pairing} is ${i.ratio}:1 (recommended ≥ ${i.required}:1).`,
    );
  return { ok: true, message: "Draft saved.", warnings };
}

export async function publishBrandAction(
  orgSlug: string,
): Promise<ActionState> {
  const ctx = await requireOrgContext(orgSlug);
  if (!can(ctx, "org.branding.publish")) {
    return {
      ok: false,
      message: "You do not have permission to publish branding.",
    };
  }
  const user = await requireUser();
  const supabase = await supabaseServer();

  const { data: row } = await supabase
    .from("organization_branding")
    .select("theme_draft")
    .eq("organization_id", ctx.organization.id)
    .maybeSingle();
  if (!row?.theme_draft) {
    return { ok: false, message: "There is no draft to publish." };
  }

  // Server-side re-validation: the draft must parse AND clear blocking contrast.
  const parsed = tenantThemeSchema.safeParse(row.theme_draft);
  if (!parsed.success) {
    return {
      ok: false,
      message: "The draft is invalid and cannot be published.",
    };
  }
  if (themeHasBlockingContrast(parsed.data)) {
    const blocking = evaluateThemeContrast(parsed.data)
      .filter((i) => i.level === "blocking")
      .map(
        (i) =>
          `${i.mode}: ${i.pairing} is ${i.ratio}:1 (required ≥ ${i.required}:1)`,
      )
      .join("; ");
    return {
      ok: false,
      message: `Publication blocked by contrast requirements — ${blocking}.`,
    };
  }

  const { error } = await supabase
    .from("organization_branding")
    .update({
      theme_published: parsed.data,
      published_at: new Date().toISOString(),
      published_by: user.id,
      // Keep the legacy fallback columns in step with the published theme.
      accent_light: parsed.data.colors.accentLight,
      accent_dark: parsed.data.colors.accentDark,
    })
    .eq("organization_id", ctx.organization.id);
  if (error) return { ok: false, message: dbErrorMessage(error) };

  revalidatePath(`/${orgSlug}/admin`, "layout");
  return {
    ok: true,
    message: "Theme published. It is now live for this organization.",
  };
}

export async function revertBrandDraftAction(
  orgSlug: string,
): Promise<ActionState> {
  const ctx = await requireOrgContext(orgSlug);
  if (!can(ctx, "org.branding.manage")) {
    return {
      ok: false,
      message: "You do not have permission to edit branding.",
    };
  }
  const user = await requireUser();
  const supabase = await supabaseServer();

  const { data: row } = await supabase
    .from("organization_branding")
    .select("theme_published")
    .eq("organization_id", ctx.organization.id)
    .maybeSingle();

  const { error } = await supabase
    .from("organization_branding")
    .update({
      theme_draft: row?.theme_published ?? null,
      draft_updated_at: new Date().toISOString(),
      draft_updated_by: user.id,
    })
    .eq("organization_id", ctx.organization.id);
  if (error) return { ok: false, message: dbErrorMessage(error) };

  revalidatePath(`/${orgSlug}/admin/branding`);
  return {
    ok: true,
    message: "Draft reverted to the last published configuration.",
    data: row?.theme_published ?? null,
  };
}

// ---------------------------------------------------------------------------
// Asset upload / archive
// ---------------------------------------------------------------------------

export async function uploadBrandAssetAction(
  orgSlug: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireOrgContext(orgSlug);
  if (!can(ctx, "org.branding.manage")) {
    return {
      ok: false,
      message: "You do not have permission to manage brand assets.",
    };
  }
  const user = await requireUser();

  const kind = String(formData.get("kind") ?? "") as AssetKind;
  if (!BRANDING_ASSET_KINDS.includes(kind)) {
    return { ok: false, message: "Unknown asset slot." };
  }
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: "Choose a file to upload." };
  }
  const altTextRaw = String(formData.get("alt_text") ?? "").trim();
  const altText = Array.from(altTextRaw)
    .filter((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127)
    .join("")
    .slice(0, 300);

  const bytes = new Uint8Array(await file.arrayBuffer());
  const declaredMime = file.type || "";

  // Content sniffing: the bytes must agree with the declared type.
  if (!mimeAgreesWithBytes(declaredMime, bytes)) {
    return {
      ok: false,
      message: "The file content does not match its declared type.",
    };
  }

  // SVG hostile-input gate (reject, never rewrite).
  if (declaredMime === "image/svg+xml") {
    const verdict = validateSvgContent(new TextDecoder().decode(bytes));
    if (!verdict.ok) {
      return { ok: false, message: `SVG rejected: ${verdict.reason}.` };
    }
  }

  // Decoded dimensions for rasters (decode failure = rejection).
  let width: number | null = null;
  let height: number | null = null;
  const isVector = declaredMime === "image/svg+xml";
  const isIco =
    declaredMime === "image/x-icon" ||
    declaredMime === "image/vnd.microsoft.icon";
  if (!isVector && !isIco) {
    try {
      const dim = imageSize(bytes);
      width = dim.width ?? null;
      height = dim.height ?? null;
    } catch {
      return { ok: false, message: "The image could not be decoded." };
    }
  }

  const validation = validateAssetUpload({
    kind,
    mimeType: declaredMime,
    byteSize: file.size,
    filename: file.name,
    width,
    height,
  });
  if (!validation.ok) return { ok: false, message: validation.error };

  const checksum = createHash("sha256").update(bytes).digest("hex");
  const supabase = await supabaseServer();

  // 1. Metadata row (pending) under RLS.
  const { data: pendingRow, error: insertError } = await supabase
    .from("media_assets")
    .insert({
      organization_id: ctx.organization.id,
      asset_kind: kind,
      storage_bucket: "org-branding",
      // Path is finalized after we know the id; temporary unique placeholder.
      storage_path: `organizations/${ctx.organization.id}/branding/${kind}/pending-${crypto.randomUUID()}`,
      original_filename: sanitizeFilename(file.name),
      mime_type: declaredMime,
      byte_size: file.size,
      width,
      height,
      alt_text: altText === "" ? null : altText,
      status: "pending",
      checksum,
      created_by: user.id,
      owner_user_id: user.id,
    })
    .select("id")
    .single();
  if (insertError || !pendingRow) {
    return { ok: false, message: dbErrorMessage(insertError ?? {}) };
  }

  const assetId = pendingRow.id;
  const finalPath = brandingStoragePath({
    organizationId: ctx.organization.id,
    kind,
    assetId,
    filename: file.name,
  });

  const fail = async (message: string): Promise<ActionState> => {
    await supabase
      .from("media_assets")
      .update({ status: "failed" })
      .eq("id", assetId);
    return { ok: false, message };
  };

  // 2. Bytes into storage under the caller's session (storage RLS enforces).
  const { error: uploadError } = await supabase.storage
    .from("org-branding")
    .upload(finalPath, bytes, { contentType: declaredMime, upsert: false });
  if (uploadError) {
    return fail("The upload was rejected by storage. Nothing was saved.");
  }

  // 3. Point the metadata at the stored object.
  const { error: pathError } = await supabase
    .from("media_assets")
    .update({ storage_path: finalPath })
    .eq("id", assetId);
  if (pathError) return fail(dbErrorMessage(pathError));

  // 4. Retire the previous active asset for this slot (history retained).
  const { error: retireError } = await supabase
    .from("media_assets")
    .update({ status: "replaced", replaced_by_asset_id: assetId })
    .eq("organization_id", ctx.organization.id)
    .eq("asset_kind", kind)
    .eq("status", "active");
  if (retireError) return fail(dbErrorMessage(retireError));

  // 5. Activate.
  const { error: activateError } = await supabase
    .from("media_assets")
    .update({ status: "active" })
    .eq("id", assetId);
  if (activateError) return fail(dbErrorMessage(activateError));

  revalidatePath(`/${orgSlug}/admin/branding`);
  return { ok: true, message: "Asset uploaded and active." };
}

export async function archiveBrandAssetAction(
  orgSlug: string,
  assetId: string,
): Promise<ActionState> {
  const ctx = await requireOrgContext(orgSlug);
  if (!can(ctx, "org.branding.manage")) {
    return {
      ok: false,
      message: "You do not have permission to manage brand assets.",
    };
  }
  const supabase = await supabaseServer();
  const { data, error } = await supabase
    .from("media_assets")
    .update({ status: "archived", archived_at: new Date().toISOString() })
    .eq("id", assetId)
    .eq("organization_id", ctx.organization.id)
    .eq("status", "active")
    .select("id");
  if (error) return { ok: false, message: dbErrorMessage(error) };
  if (!data?.length) return { ok: false, message: "That asset is not active." };

  revalidatePath(`/${orgSlug}/admin/branding`);
  return { ok: true, message: "Asset archived." };
}

// Live contrast feedback and per-slot limits are computed client-side from
// the pure @novakore/domain functions — no extra action endpoints needed;
// the server re-validates everything on save/publish regardless.
