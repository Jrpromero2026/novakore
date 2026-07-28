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
