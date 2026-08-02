/**
 * Platform navigation model — the single source for the sidebar and the
 * command palette. Every destination is a real, existing route; sections
 * are additive so future modules (knowledge graph, automation, developers)
 * slot in without reshaping the shell.
 *
 * `needsAny` is an affordance filter only — the server enforces
 * authorization on every route (ADR-006).
 */

export interface NavItem {
  href: string;
  label: string;
  /** Icon key resolved by the shell (keeps this module server-safe). */
  icon: string;
  needsAny?: string[];
  /** Palette-only search keywords. */
  keywords?: string[];
}

export interface NavSection {
  label: string | null;
  items: NavItem[];
}

export function buildNavSections(
  orgSlug: string,
  permissions: readonly string[],
): NavSection[] {
  const base = `/${orgSlug}/admin`;
  const held = new Set(permissions);

  const sections: NavSection[] = [
    {
      label: null,
      items: [
        { href: base, label: "Overview", icon: "overview" },
        {
          href: `${base}/intelligence`,
          label: "Intelligence",
          icon: "ai",
          needsAny: ["content.view_draft"],
          keywords: ["nova", "insights", "scorecard", "digest", "health"],
        },
        {
          href: `${base}/ops`,
          label: "Analytics",
          icon: "analytics",
          needsAny: ["analytics.view"],
          keywords: ["operations", "metrics", "feedback"],
        },
        {
          href: `/${orgSlug}/learn`,
          label: "My learning",
          icon: "learn",
          keywords: ["member", "learner view"],
        },
      ],
    },
    {
      label: "Knowledge",
      items: [
        {
          href: `${base}/studio`,
          label: "Studio",
          icon: "studio",
          needsAny: ["content.view_draft"],
          keywords: ["author", "create", "editor"],
        },
        {
          href: `${base}/studio/library`,
          label: "Library",
          icon: "library",
          needsAny: ["content.view_draft"],
          keywords: ["blocks", "reusable content"],
        },
        {
          href: `${base}/courses`,
          label: "Courses",
          icon: "course",
          needsAny: ["content.view_draft"],
          keywords: ["lessons", "programs"],
        },
        {
          href: `${base}/studio/ai`,
          label: "AI Studio",
          icon: "ai",
          needsAny: ["content.view_draft"],
          keywords: ["assistant", "generate"],
        },
      ],
    },
    {
      label: "Learning",
      items: [
        {
          href: `${base}/learning`,
          label: "Learning paths",
          icon: "path",
          needsAny: ["paths.manage"],
          keywords: ["journeys"],
        },
        {
          href: `${base}/assessments`,
          label: "Assessments",
          icon: "assessment",
          needsAny: ["assessment.author", "assessment.publish"],
          keywords: ["evaluations", "quizzes"],
        },
        {
          href: `${base}/reviews`,
          label: "Reviews",
          icon: "review",
          needsAny: ["assessment.grade"],
          keywords: ["grading", "queue"],
        },
        {
          href: `${base}/enrollments`,
          label: "Enrollments",
          icon: "enrollment",
          needsAny: ["enrollment.manage"],
        },
        {
          href: `${base}/credentials`,
          label: "Credentials",
          icon: "credential",
          needsAny: ["certificates.manage"],
          keywords: ["certificates", "verification"],
        },
      ],
    },
    {
      label: "Organization",
      items: [
        {
          href: `${base}/organization`,
          label: "Organization hub",
          icon: "academy",
          keywords: ["identity", "mission", "values", "timeline", "hub"],
        },
        { href: `${base}/academies`, label: "Academies", icon: "academy" },
        {
          href: `${base}/members`,
          label: "Members",
          icon: "members",
          needsAny: ["org.members.manage"],
          keywords: ["people", "invite"],
        },
        {
          href: `${base}/roles`,
          label: "Roles & permissions",
          icon: "roles",
          needsAny: ["org.roles.manage"],
        },
        {
          href: `${base}/terminology`,
          label: "Terminology",
          icon: "terminology",
          needsAny: ["org.terminology.manage"],
          keywords: ["vocabulary", "labels"],
        },
        {
          href: `${base}/branding`,
          label: "Branding",
          icon: "branding",
          needsAny: ["org.branding.manage"],
          keywords: ["theme", "logo", "colors"],
        },
        {
          href: `${base}/settings`,
          label: "Settings",
          icon: "settings",
          needsAny: ["org.manage"],
          keywords: ["profile", "organization name", "slug"],
        },
      ],
    },
  ];

  return sections
    .map((section) => ({
      ...section,
      items: section.items.filter(
        (item) => !item.needsAny || item.needsAny.some((p) => held.has(p)),
      ),
    }))
    .filter((section) => section.items.length > 0);
}
