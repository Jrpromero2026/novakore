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
import { buildDomains } from "@/lib/navigation/domains";
import { GlobalNav } from "@/components/shell/global-nav";

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
  const domains = buildDomains(orgSlug, permissions);

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
    // With no sidebar the palette becomes the fastest route to a specific
    // page, so it is fed from the same domain model the navigation uses —
    // one source of truth, and the domain name becomes a search keyword.
    ...domains.flatMap((domain) =>
      domain.sections.flatMap((section) =>
        section.items.map((item) => ({
          id: item.href,
          label: item.label,
          group: domain.label,
          href: item.href,
          keywords: [...(item.keywords ?? []), section.label, domain.label],
        })),
      ),
    ),
    // The domain landing pages are destinations in their own right.
    ...domains
      .filter((d) => d.sections.length > 0)
      .map((d) => ({
        id: d.href,
        label: d.label,
        group: "Domains",
        href: d.href,
        keywords: ["domain", "overview"],
      })),
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
    <WalkthroughProvider
      orgId={ctx.organization.id}
      orgSlug={orgSlug}
      permissions={permissions}
      terminologyOverrides={terminology.overrides}
      recordEvent={recordOnboardingEventAction}
    >
      <div className="flex min-h-dvh flex-col">
        <OrgThemeStyle theme={brand.theme} />

        <GlobalNav domains={domains} organizationName={displayName}>
          <CommandPaletteTrigger />
          <HelpMenu orgSlug={orgSlug} />
          <ThemeToggle />
          <UserMenu email={user?.email ?? null} signOutAction={signOutAction} />
        </GlobalNav>

        <main className="min-w-0 flex-1">
          {/*
            The layout owns the page frame — width, gutters, rhythm — so that
            every page, migrated or not, sits in the same column. PageShell
            composes CONTENT inside this frame and deliberately does not set
            its own width, or the two would fight.
          */}
          <div
            className="nk-fade-up mx-auto w-full px-4 py-8 sm:px-6 sm:py-10"
            style={{ maxWidth: "var(--layout-page-max)" }}
          >
            {children}
          </div>
        </main>

        <CommandPalette entries={paletteEntries} />
        <FeedbackWidget orgSlug={orgSlug} roleHint="admin" />
      </div>
    </WalkthroughProvider>
  );
}
