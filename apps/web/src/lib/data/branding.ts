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

/**
 * Phase 1A column defaults. A branding row still carrying these was never
 * customized — it must fall back to the NovaKore platform theme, not be
 * misread as a deliberate tenant palette.
 */
const LEGACY_DEFAULT_ACCENTS = new Set(["#4f46e5", "#818cf8"]);

function legacyThemeOrNull(row: {
  accent_light: string;
  accent_dark: string;
  secondary_accent_light?: string | null;
  secondary_accent_dark?: string | null;
  font_family?: string;
  radius_scale?: string;
}): TenantTheme | null {
  const untouched =
    LEGACY_DEFAULT_ACCENTS.has(row.accent_light.toLowerCase()) &&
    LEGACY_DEFAULT_ACCENTS.has(row.accent_dark.toLowerCase());
  if (untouched) return null;
  try {
    return themeFromLegacyBranding(row);
  } catch {
    return null;
  }
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
    // fall back to converting genuinely customized legacy columns; otherwise
    // the NovaKore platform theme applies.
    const published = (row as Record<string, unknown>)["theme_published"];
    if (published) {
      const parsed = tenantThemeSchema.safeParse(published);
      if (parsed.success)
        return { displayName: row.display_name, theme: parsed.data };
    }

    return { displayName: row.display_name, theme: legacyThemeOrNull(row) };
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

  const legacyTheme = legacyThemeOrNull(row);

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
