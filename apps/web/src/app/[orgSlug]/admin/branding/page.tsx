import type { Metadata } from "next";
import {
  NOVAKORE_BASE,
  THEME_SCHEMA_VERSION,
  type AssetKind,
  type TenantTheme,
} from "@novakore/domain";
import { can, requireOrgContext, requirePermission } from "@/lib/org-context";
import { getActiveBrandAssets, getBrandStudioRow } from "@/lib/data/branding";
import { PageHeader } from "@/components/ui/layout";
import { BrandStudio } from "./brand-studio";
import type { AssetSlotView } from "./asset-slots";

export const metadata: Metadata = { title: "Branding" };

const SLOT_DEFINITIONS: { kind: AssetKind; label: string; guidance: string }[] =
  [
    {
      kind: "logo_horizontal",
      label: "Primary logo",
      guidance:
        "Horizontal lockup for light surfaces; SVG preferred, transparent background",
    },
    {
      kind: "logo_horizontal_inverse",
      label: "Inverse logo",
      guidance: "Variant tuned for dark surfaces",
    },
    {
      kind: "monogram",
      label: "Monogram",
      guidance: "Square mark for compact placements",
    },
    {
      kind: "favicon",
      label: "Favicon",
      guidance: "Square, at least 48×48; SVG, PNG, or ICO",
    },
    {
      kind: "app_icon",
      label: "App icon",
      guidance: "Square raster, at least 512×512",
    },
    {
      kind: "email_logo",
      label: "Email logo",
      guidance: "Raster only; at least 240 px wide",
    },
  ];

/** Editable default when an org has no draft yet: platform base as a theme. */
function platformDefaultDraft(): TenantTheme {
  return {
    schemaVersion: THEME_SCHEMA_VERSION,
    colors: {
      accentLight: NOVAKORE_BASE.light.accent,
      accentDark: NOVAKORE_BASE.dark.accent,
    },
    typography: { interfaceFont: "geist" },
    shape: { radiusProfile: "balanced" },
    modes: { availability: "both", defaultMode: "system" },
  };
}

export default async function BrandingPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const ctx = await requireOrgContext(orgSlug);
  requirePermission(ctx, "org.branding.manage");

  const [row, assets] = await Promise.all([
    getBrandStudioRow(ctx.organization.id),
    getActiveBrandAssets(ctx.organization.id),
  ]);

  const initialDraft: TenantTheme =
    row?.themeDraft ??
    row?.themePublished ??
    row?.legacyTheme ??
    platformDefaultDraft();

  const slots: AssetSlotView[] = SLOT_DEFINITIONS.map((definition) => {
    const active = assets.find((a) => a.kind === definition.kind);
    return {
      ...definition,
      current: active
        ? {
            id: active.id,
            signedUrl: active.signedUrl,
            originalFilename: active.originalFilename,
            byteSize: active.byteSize,
            width: active.width,
            height: active.height,
            altText: active.altText,
          }
        : null,
    };
  });

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Organization"
        title="Branding"
        description="Configure this organization's identity. Drafts are private until published; platform status and security colors always stay readable."
      />

      <BrandStudio
        orgSlug={orgSlug}
        initialDraft={initialDraft}
        publishedAt={row?.publishedAt ?? null}
        draftUpdatedAt={row?.draftUpdatedAt ?? null}
        canPublish={can(ctx, "org.branding.publish")}
        assets={slots}
      />
    </div>
  );
}
