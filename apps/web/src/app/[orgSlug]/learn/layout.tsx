import Link from "next/link";
import { requireOrgContext } from "@/lib/org-context";
import { getOrgBrandContext } from "@/lib/data/branding";
import { getTerminology } from "@/lib/terminology";
import { signOutAction } from "@/lib/actions/auth";
import { recordOnboardingEventAction } from "@/lib/actions/onboarding";
import { OrgThemeStyle } from "@/components/org-theme";
import { ThemeToggle } from "@/components/theme-toggle";
import { FeedbackWidget } from "@/components/feedback/feedback-widget";
import { WalkthroughProvider } from "@/components/onboarding/walkthrough";
import { ReadLimitedBanner } from "@/components/shell/read-limited-banner";

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
  const [brand, terminology] = await Promise.all([
    getOrgBrandContext(ctx.organization.id),
    getTerminology(ctx.organization.id),
  ]);

  return (
    <WalkthroughProvider
      orgId={ctx.organization.id}
      orgSlug={orgSlug}
      permissions={[...ctx.orgPermissions] as string[]}
      terminologyOverrides={terminology.overrides}
      recordEvent={recordOnboardingEventAction}
    >
      <div className="flex min-h-dvh flex-col">
        <OrgThemeStyle theme={brand.theme} />
        {/* Visible only on focus — same affordance the admin shell documents:
            keyboard users skip the branded header on every navigation. */}
        <a
          href="#main"
          className="sr-only rounded-md bg-surface px-4 py-2 text-body-sm font-medium text-accent shadow-lg outline-2 outline-offset-2 outline-accent focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50"
        >
          Skip to content
        </a>
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
          id="main"
          tabIndex={-1}
          className="mx-auto w-full flex-1 px-5 py-8"
          style={{ maxWidth: "var(--layout-form-max)" }}
        >
          <ReadLimitedBanner ctx={ctx} />
          {children}
        </main>
        <FeedbackWidget orgSlug={orgSlug} roleHint="member" />
      </div>
    </WalkthroughProvider>
  );
}
