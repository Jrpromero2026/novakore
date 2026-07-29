import "server-only";
import type { ContentBlock } from "@novakore/domain";
import { supabaseServer } from "../supabase/server";

/**
 * Signed-URL resolution for governed media blocks. Runs under the
 * caller's RLS session: signing requires SELECT on the object, so
 * cross-tenant asset references resolve to nothing (fail closed).
 */

const MEDIA_BLOCK_TYPES = new Set(["image", "audio", "pdf"]);
const SIGNED_URL_SECONDS = 3600;

export async function resolveMediaUrls(
  blocks: ContentBlock[],
): Promise<Map<string, string>> {
  const assetIds = [
    ...new Set(
      blocks
        .filter((b) => MEDIA_BLOCK_TYPES.has(b.type))
        .map((b) => (b.data as { assetId?: string }).assetId)
        .filter((id): id is string => typeof id === "string"),
    ),
  ];
  const urls = new Map<string, string>();
  if (assetIds.length === 0) return urls;

  const supabase = await supabaseServer();
  const { data: assets } = await supabase
    .from("media_assets")
    .select("id, storage_bucket, storage_path")
    .in("id", assetIds)
    .eq("status", "active");

  await Promise.all(
    (assets ?? []).map(async (asset) => {
      const { data } = await supabase.storage
        .from(asset.storage_bucket)
        .createSignedUrl(asset.storage_path, SIGNED_URL_SECONDS);
      if (data?.signedUrl) urls.set(asset.id, data.signedUrl);
    }),
  );
  return urls;
}

export interface LessonMediaAsset {
  id: string;
  kind: string;
  fileName: string;
  mimeType: string;
  createdAt: string;
}

export async function listLessonMedia(
  organizationId: string,
): Promise<LessonMediaAsset[]> {
  const supabase = await supabaseServer();
  const { data } = await supabase
    .from("media_assets")
    .select("id, asset_kind, original_filename, mime_type, created_at")
    .eq("organization_id", organizationId)
    .eq("storage_bucket", "lesson-media")
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(100);
  return (data ?? []).map((a) => ({
    id: a.id,
    kind: a.asset_kind,
    fileName: a.original_filename ?? "asset",
    mimeType: a.mime_type,
    createdAt: a.created_at,
  }));
}
