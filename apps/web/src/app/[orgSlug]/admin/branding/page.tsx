import type { Metadata } from "next";
import { requireOrgContext, requirePermission } from "@/lib/org-context";
import { supabaseServer } from "@/lib/supabase/server";
import { Card, CardHeader } from "@/components/ui/primitives";
import { BrandingForm } from "./branding-form";

export const metadata: Metadata = { title: "Branding" };

export default async function BrandingPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const ctx = await requireOrgContext(orgSlug);
  requirePermission(ctx, "org.branding.manage");

  const supabase = await supabaseServer();
  const { data: branding } = await supabase
    .from("organization_branding")
    .select(
      "display_name, logo_path, accent_light, accent_dark, font_family, radius_scale",
    )
    .eq("organization_id", ctx.organization.id)
    .maybeSingle();

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight text-text">
          Branding
        </h1>
        <p className="text-sm text-text-muted">
          Accent colors and type shape the whole workspace in light and dark
          modes. Values are validated — only safe theme tokens are applied.
        </p>
      </header>

      <Card>
        <CardHeader
          title="Theme"
          description="Logo upload arrives with media storage in Phase 1B."
        />
        <div className="px-5 py-4">
          <BrandingForm
            orgSlug={orgSlug}
            initial={{
              display_name: branding?.display_name ?? "",
              accent_light: branding?.accent_light ?? "#4f46e5",
              accent_dark: branding?.accent_dark ?? "#818cf8",
              font_family: branding?.font_family ?? "geist",
              radius_scale: branding?.radius_scale ?? "medium",
            }}
          />
        </div>
      </Card>
    </div>
  );
}
