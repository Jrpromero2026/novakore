import Link from "next/link";
import { requireOrgContext } from "@/lib/org-context";
import { supabaseServer } from "@/lib/supabase/server";
import { signOutAction } from "@/lib/actions/auth";
import { OrgThemeStyle, orgThemeDataAttributes } from "@/components/org-theme";
import { ThemeToggle } from "@/components/theme-toggle";
import { AdminNav } from "./nav";

export default async function OrgAdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const ctx = await requireOrgContext(orgSlug);

  const supabase = await supabaseServer();
  const { data: branding } = await supabase
    .from("organization_branding")
    .select(
      "display_name, accent_light, accent_dark, font_family, radius_scale",
    )
    .eq("organization_id", ctx.organization.id)
    .maybeSingle();

  const theme = branding ?? {
    display_name: null,
    accent_light: "#4f46e5",
    accent_dark: "#818cf8",
    font_family: "geist",
    radius_scale: "medium",
  };
  const dataAttrs = orgThemeDataAttributes(theme);

  return (
    <div className="flex min-h-dvh flex-col" {...dataAttrs}>
      <OrgThemeStyle theme={theme} />
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 py-3">
          <div className="flex items-baseline gap-3">
            <Link
              href={`/${orgSlug}/admin`}
              className="text-sm font-semibold tracking-tight text-text"
            >
              {theme.display_name ?? ctx.organization.name}
            </Link>
            <span className="hidden text-[11px] uppercase tracking-widest text-text-faint sm:inline">
              Organization admin
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/select-org"
              className="rounded-md px-2.5 py-1.5 text-xs font-medium text-text-muted hover:bg-surface-sunken hover:text-text"
            >
              Switch org
            </Link>
            <ThemeToggle />
            <form action={signOutAction}>
              <button
                type="submit"
                className="rounded-md px-2.5 py-1.5 text-xs font-medium text-text-muted hover:bg-surface-sunken hover:text-text"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-5 py-8 md:flex-row">
        <AdminNav orgSlug={orgSlug} permissions={[...ctx.orgPermissions]} />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
