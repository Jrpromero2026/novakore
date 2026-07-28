import Link from "next/link";
import { requireOrgContext } from "@/lib/org-context";
import { getOrgBrandContext } from "@/lib/data/branding";
import { signOutAction } from "@/lib/actions/auth";
import { OrgThemeStyle } from "@/components/org-theme";
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
  const brand = await getOrgBrandContext(ctx.organization.id);

  return (
    <div className="flex min-h-dvh flex-col">
      <OrgThemeStyle theme={brand.theme} />
      <header
        className="sticky top-0 border-b border-border-default bg-surface"
        style={{ zIndex: "var(--z-nav)" }}
      >
        <div
          className="mx-auto flex w-full items-center justify-between gap-4 px-5"
          style={{
            maxWidth: "var(--layout-page-max)",
            height: "var(--layout-header)",
          }}
        >
          <div className="flex items-baseline gap-3">
            <Link
              href={`/${orgSlug}/admin`}
              className="text-title font-semibold text-text-primary"
            >
              {brand.displayName ?? ctx.organization.name}
            </Link>
            <span
              className="hidden text-caption uppercase text-text-muted sm:inline"
              style={{ letterSpacing: "var(--tracking-caps)" }}
            >
              Organization admin
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/select-org"
              className="rounded-md px-2.5 py-1.5 text-label text-text-secondary transition-colors duration-[var(--motion-fast)] hover:bg-surface-interactive hover:text-text-primary"
            >
              Switch org
            </Link>
            <ThemeToggle />
            <form action={signOutAction}>
              <button
                type="submit"
                className="rounded-md px-2.5 py-1.5 text-label text-text-secondary transition-colors duration-[var(--motion-fast)] hover:bg-surface-interactive hover:text-text-primary"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <div
        className="mx-auto flex w-full flex-1 flex-col gap-8 px-5 py-8 md:flex-row"
        style={{ maxWidth: "var(--layout-page-max)" }}
      >
        <AdminNav orgSlug={orgSlug} permissions={[...ctx.orgPermissions]} />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
