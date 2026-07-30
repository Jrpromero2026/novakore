import Link from "next/link";
import { requireOrgContext } from "@/lib/org-context";
import { getOrgBrandContext } from "@/lib/data/branding";
import { signOutAction } from "@/lib/actions/auth";
import { OrgThemeStyle } from "@/components/org-theme";
import { ThemeToggle } from "@/components/theme-toggle";
import { FeedbackWidget } from "@/components/feedback/feedback-widget";

/** Learner delivery shell: organization branding + terminology, no admin chrome. */
export default async function LearnLayout({
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
          <Link
            href={`/${orgSlug}/learn`}
            className="text-title font-semibold text-text-primary"
          >
            {brand.displayName ?? ctx.organization.name}
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <form action={signOutAction}>
              <button
                type="submit"
                className="rounded-md px-2.5 py-1.5 text-label text-text-secondary transition-colors hover:bg-surface-interactive hover:text-text-primary"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main
        className="mx-auto w-full flex-1 px-5 py-8"
        style={{ maxWidth: "var(--layout-form-max)" }}
      >
        {children}
      </main>
      <FeedbackWidget orgSlug={orgSlug} roleHint="member" />
    </div>
  );
}
