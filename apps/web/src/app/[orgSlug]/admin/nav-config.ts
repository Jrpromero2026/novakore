/**
 * Platform navigation model — the single source for the sidebar and the
 * command palette. Every destination is a real, existing route; sections
 * are additive so future modules (knowledge graph, automation, developers)
 * slot in without reshaping the shell.
 *
 * `needsAny` is an affordance filter only — the server enforces
 * authorization on every route (ADR-006).
 */

import type { TourTargetId } from "@/lib/onboarding/targets";

export interface NavItem {
  href: string;
  label: string;
  /** Icon key resolved by the shell (keeps this module server-safe). */
  icon: string;
  needsAny?: string[];
  /** Palette-only search keywords. */
  keywords?: string[];
  /** Durable walkthrough target id — stamped as data-tour-id by the shell. */
  tourId?: TourTargetId;
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
        {
          href: base,
          label: "Overview",
          icon: "overview",
          tourId: "admin-sidebar-overview",
        },
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
          tourId: "admin-sidebar-analytics",
          needsAny: ["analytics.view"],
          keywords: ["operations", "metrics", "feedback"],
        },
        {
          href: `/${orgSlug}/learn`,
          label: "My learning",
          icon: "learn",
          tourId: "admin-sidebar-my-learning",
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
          tourId: "admin-sidebar-studio",
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
          tourId: "admin-sidebar-courses",
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
          tourId: "admin-sidebar-learning-paths",
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
          tourId: "admin-sidebar-enrollments",
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
          tourId: "admin-sidebar-organization",
          keywords: ["identity", "mission", "values", "timeline", "hub"],
        },
        { href: `${base}/academies`, label: "Academies", icon: "academy" },
        {
          href: `${base}/members`,
          label: "Members",
          icon: "members",
          tourId: "admin-sidebar-members",
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
          tourId: "admin-sidebar-branding",
          needsAny: ["org.branding.manage"],
          keywords: ["theme", "logo", "colors"],
        },
        {
          href: `${base}/settings`,
          label: "Settings",
          icon: "settings",
          tourId: "admin-sidebar-settings",
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
