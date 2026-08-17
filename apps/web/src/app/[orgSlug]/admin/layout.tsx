import Link from "next/link";
import { requireOrgContext } from "@/lib/org-context";
import { getUser } from "@/lib/auth";
import { getOrgBrandContext } from "@/lib/data/branding";
import { getTerminology } from "@/lib/terminology";
import { getPaletteKnowledge } from "@/lib/data/palette";
import { signOutAction } from "@/lib/actions/auth";
import { recordOnboardingEventAction } from "@/lib/actions/onboarding";
import { WalkthroughProvider } from "@/components/onboarding/walkthrough";
import { HelpMenu } from "@/components/onboarding/help-menu";
import { OrgThemeStyle } from "@/components/org-theme";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserMenu } from "@/components/ui/user-menu";
import { FeedbackWidget } from "@/components/feedback/feedback-widget";
import {
  CommandPalette,
  type PaletteEntry,
} from "@/components/command-palette";
import { CommandPaletteTrigger } from "@/components/command-palette";
import { buildNavSections } from "./nav-config";
import { AdminSidebar, MobileNavButton, PinButton, ShellProvider } from "./nav";

export default async function OrgAdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const ctx = await requireOrgContext(orgSlug);
  const [brand, user, terminology] = await Promise.all([
    getOrgBrandContext(ctx.organization.id),
    getUser(),
    getTerminology(ctx.organization.id),
  ]);
  const displayName = brand.displayName ?? ctx.organization.name;

  const permissions = [...ctx.orgPermissions] as string[];
  const sections = buildNavSections(orgSlug, permissions);

  // Palette entries: every visible destination + creation surfaces the
  // member can actually reach. All real routes — the server authorizes.
  const held = new Set(permissions);
  const base = `/${orgSlug}/admin`;

  // Global search: real knowledge titles for draft-visibility holders —
  // lessons, courses, journeys, evaluations. Grounded rows, small caps.
  // The fan-out is cached per organization; the gate below is the audience
  // the cache entry is keyed for (see lib/data/palette.ts).
  let knowledgeEntries: PaletteEntry[] = [];
  if (held.has("content.view_draft")) {
    const { lessons, courses, paths, assessments } = await getPaletteKnowledge(
      ctx.organization.id,
    );
    knowledgeEntries = [
      ...lessons.map((l) => ({
        id: `lesson-${l.id}`,
        label: l.title,
        group: "Knowledge",
        href: `${base}/courses/${l.course_id}/lessons/${l.id}`,
        keywords: ["lesson"],
      })),
      ...courses.map((c) => ({
        id: `course-${c.id}`,
        label: c.title,
        group: "Knowledge",
        href: `${base}/courses/${c.id}`,
        keywords: ["course"],
      })),
      ...paths.map((p) => ({
        id: `path-${p.id}`,
        label: p.title,
        group: "Knowledge",
        href: `${base}/studio/paths/${p.id}`,
        keywords: ["journey", "path"],
      })),
      ...assessments.map((a) => ({
        id: `assessment-${a.id}`,
        label: a.title,
        group: "Knowledge",
        href: `${base}/assessments`,
        keywords: ["assessment", "evaluation"],
      })),
    ];
  }

  const paletteEntries: PaletteEntry[] = [
    ...sections.flatMap((section) =>
      section.items.map((item) => ({
        id: item.href,
        label: item.label,
        group: "Navigate",
        href: item.href,
        keywords: [...(item.keywords ?? []), section.label ?? ""],
      })),
    ),
    ...(held.has("content.view_draft")
      ? [
          {
            id: "create-course",
            label: "New course",
            group: "Create",
            href: `${base}/courses`,
            keywords: ["create course"],
          },
          {
            id: "create-studio",
            label: "Compose in Studio",
            group: "Create",
            href: `${base}/studio`,
            keywords: ["author", "lesson"],
          },
        ]
      : []),
    ...(held.has("paths.manage")
      ? [
          {
            id: "create-path",
            label: "New learning path",
            group: "Create",
            href: `${base}/learning`,
            keywords: ["journey"],
          },
        ]
      : []),
    ...(held.has("assessment.author")
      ? [
          {
            id: "create-assessment",
            label: "New assessment",
            group: "Create",
            href: `${base}/assessments`,
            keywords: ["evaluation"],
          },
        ]
      : []),
    ...(held.has("org.members.manage")
      ? [
          {
            id: "invite-member",
            label: "Invite member",
            group: "Create",
            href: `${base}/members`,
            keywords: ["add people"],
          },
        ]
      : []),
    ...knowledgeEntries,
  ];

  return (
    <ShellProvider>
      <WalkthroughProvider
        orgId={ctx.organization.id}
        orgSlug={orgSlug}
        permissions={permissions}
        terminologyOverrides={terminology.overrides}
        recordEvent={recordOnboardingEventAction}
      >
        <div className="flex min-h-dvh flex-col">
          <OrgThemeStyle theme={brand.theme} />
          <header
            className="sticky top-0 border-b border-border-subtle bg-background/85 backdrop-blur-md"
            style={{ zIndex: "var(--z-nav)" }}
          >
            <div
              className="flex w-full items-center justify-between gap-3 px-4 sm:px-5"
              style={{ height: "var(--layout-header)" }}
            >
              <div className="flex min-w-0 items-center gap-1.5">
                <MobileNavButton />
                <Link
                  href={`/${orgSlug}/admin`}
                  className="truncate text-title font-semibold text-text-primary"
                >
                  {displayName}
                </Link>
                <span
                  className="mt-px hidden text-caption uppercase text-text-muted lg:inline"
                  style={{ letterSpacing: "var(--tracking-caps)" }}
                >
                  · Workspace
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <CommandPaletteTrigger />
                <PinButton orgSlug={orgSlug} />
                <HelpMenu orgSlug={orgSlug} />
                <ThemeToggle />
                <UserMenu
                  email={user?.email ?? null}
                  signOutAction={signOutAction}
                />
              </div>
            </div>
          </header>

          <div className="flex w-full flex-1">
            <AdminSidebar
              sections={sections}
              orgName={displayName}
              orgSlug={orgSlug}
            />
            <main className="min-w-0 flex-1">
              <div
                className="nk-fade-up mx-auto w-full px-4 py-8 sm:px-8"
                style={{ maxWidth: "var(--layout-page-max)" }}
              >
                {children}
              </div>
            </main>
          </div>

          <CommandPalette entries={paletteEntries} />
          <FeedbackWidget orgSlug={orgSlug} roleHint="admin" />
        </div>
      </WalkthroughProvider>
    </ShellProvider>
  );
}
