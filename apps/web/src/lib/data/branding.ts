import "server-only";
import { cache } from "react";
import {
  tenantThemeSchema,
  themeFromLegacyBranding,
  type TenantTheme,
} from "@novakore/domain";
import { supabaseServer } from "../supabase/server";

/**
 * Branding data access (D-08 module). Reads run under the caller's RLS
 * session; anything unreadable resolves to platform defaults — a tenant can
 * never be visually broken by missing or inaccessible branding.
 */

export interface OrgBrandContext {
  displayName: string | null;
  /** Published theme only — drafts never leak into live surfaces. */
  theme: TenantTheme | null;
}

export const getOrgBrandContext = cache(
  async (organizationId: string): Promise<OrgBrandContext> => {
    const supabase = await supabaseServer();
    const { data: row } = await supabase
      .from("organization_branding")
      .select("*")
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (!row) return { displayName: null, theme: null };

    // Prefer the published versioned theme when present (Phase 1B schema);
    // fall back to converting the legacy flat columns; fall back to platform.
    const published = (row as Record<string, unknown>)["theme_published"];
    if (published) {
      const parsed = tenantThemeSchema.safeParse(published);
      if (parsed.success)
        return { displayName: row.display_name, theme: parsed.data };
    }

    try {
      return {
        displayName: row.display_name,
        theme: themeFromLegacyBranding(row),
      };
    } catch {
      return { displayName: row.display_name, theme: null };
    }
  },
);

// ---------------------------------------------------------------------------
// Brand studio reads
// ---------------------------------------------------------------------------

export interface BrandStudioRow {
  displayName: string | null;
  themeDraft: TenantTheme | null;
  themePublished: TenantTheme | null;
  legacyTheme: TenantTheme | null;
  draftUpdatedAt: string | null;
  publishedAt: string | null;
  publishedBy: string | null;
}

/** Full branding state for the studio (drafts included — manage gate is on the page). */
export async function getBrandStudioRow(
  organizationId: string,
): Promise<BrandStudioRow | null> {
  const supabase = await supabaseServer();
  const { data: row } = await supabase
    .from("organization_branding")
    .select("*")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!row) return null;

  const parse = (value: unknown): TenantTheme | null => {
    if (!value) return null;
    const parsed = tenantThemeSchema.safeParse(value);
    return parsed.success ? parsed.data : null;
  };

  let legacyTheme: TenantTheme | null = null;
  try {
    legacyTheme = themeFromLegacyBranding(row);
  } catch {
    legacyTheme = null;
  }

  return {
    displayName: row.display_name,
    themeDraft: parse(row.theme_draft),
    themePublished: parse(row.theme_published),
    legacyTheme,
    draftUpdatedAt: row.draft_updated_at,
    publishedAt: row.published_at,
    publishedBy: row.published_by,
  };
}

export interface BrandAssetView {
  id: string;
  kind: string;
  originalFilename: string;
  mimeType: string;
  byteSize: number;
  width: number | null;
  height: number | null;
  altText: string | null;
  updatedAt: string;
  /** Short-lived signed URL (1 h); null when signing fails. */
  signedUrl: string | null;
}

/** Active branding assets with signed URLs (RLS gates both metadata and objects). */
export async function getActiveBrandAssets(
  organizationId: string,
): Promise<BrandAssetView[]> {
  const supabase = await supabaseServer();
  const { data: rows } = await supabase
    .from("media_assets")
    .select(
      "id, asset_kind, original_filename, mime_type, byte_size, width, height, alt_text, updated_at, storage_bucket, storage_path",
    )
    .eq("organization_id", organizationId)
    .eq("status", "active");

  const views: BrandAssetView[] = [];
  for (const row of rows ?? []) {
    const { data: signed } = await supabase.storage
      .from(row.storage_bucket)
      .createSignedUrl(row.storage_path, 3600);
    views.push({
      id: row.id,
      kind: row.asset_kind,
      originalFilename: row.original_filename,
      mimeType: row.mime_type,
      byteSize: row.byte_size,
      width: row.width,
      height: row.height,
      altText: row.alt_text,
      updatedAt: row.updated_at,
      signedUrl: signed?.signedUrl ?? null,
    });
  }
  return views;
}
