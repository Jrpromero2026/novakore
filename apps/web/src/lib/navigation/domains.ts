/**
 * The six-domain navigation model.
 *
 * Replaces `buildNavSections`, which listed twenty destinations at once and
 * fed both the sidebar and the command palette. The shape is different but
 * the contract is identical: `needsAny` is an AFFORDANCE FILTER ONLY — the
 * server enforces authorization on every route (ADR-006). Nothing here may
 * be treated as a security boundary.
 *
 * Two structural rules make progressive disclosure real rather than
 * decorative:
 *
 *   1. A domain shows what exists at ITS level, never the whole platform.
 *   2. A domain with no visible sections is not rendered in the navigation
 *      at all. An empty destination is worse than a hidden one, because it
 *      advertises a capability the caller does not hold.
 *
 * Route ownership is derived FROM this model rather than duplicated beside
 * it, so a destination cannot drift into belonging to two domains.
 */

import {
  PLATFORM_TERM_DEFAULTS,
  type TermDisplay,
  type TermKey,
} from "@novakore/domain";

/**
 * Resolves a tenant's display term. Navigation labels go through this so the
 * trail and the page it leads to cannot disagree about what a thing is
 * called: an organization that renames Course to Program sees Program in
 * both, or the breadcrumb starts describing a product the tenant does not
 * recognize. Defaults to the platform vocabulary so callers that genuinely
 * have no tenant context (tests, the palette's static entries) still work.
 */
export type NavTermResolver = (key: TermKey) => TermDisplay;

const DEFAULT_TERMS: NavTermResolver = (key) => PLATFORM_TERM_DEFAULTS[key];

export type DomainKey =
  "home" | "knowledge" | "learning" | "people" | "intelligence" | "workspace";

export interface DomainItem {
  href: string;
  label: string;
  /** One line, shown on the navigation card. Never a restatement of the label. */
  description: string;
  /** Icon key resolved by the shell, keeping this module server-safe. */
  icon: string;
  needsAny?: string[];
  /** Extra terms the command palette should match on. */
  keywords?: string[];
}

export interface DomainSection {
  label: string;
  description: string;
  items: DomainItem[];
}

export interface Domain {
  key: DomainKey;
  label: string;
  href: string;
  /** Shown under the domain heading; explains the domain in one sentence. */
  summary: string;
  sections: DomainSection[];
  /**
   * Home has no cards — it is the command centre, not an index — so it would
   * otherwise be filtered out as empty.
   */
  alwaysVisible?: boolean;
}

export function buildDomains(
  orgSlug: string,
  permissions: readonly string[],
  term: NavTermResolver = DEFAULT_TERMS,
): Domain[] {
  const base = `/${orgSlug}/admin`;
  const held = new Set(permissions);

  const all: Domain[] = [
    {
      key: "home",
      label: "Home",
      href: base,
      summary: "What needs attention, and where you left off.",
      alwaysVisible: true,
      sections: [],
    },

    {
      key: "knowledge",
      label: "Knowledge",
      href: `${base}/knowledge`,
      summary: "What this organization writes, reuses and publishes.",
      sections: [
        {
          label: "Authoring",
          description: "Where content is created and assembled.",
          items: [
            {
              href: `${base}/studio`,
              label: "Studio",
              description: "Compose lessons in the knowledge workspace",
              icon: "studio",
              needsAny: ["content.view_draft"],
              keywords: ["author", "create", "editor", "compose"],
            },
            {
              href: `${base}/studio/sources`,
              label: "Sources",
              description:
                "Upload documents, data, images, and video to build from",
              icon: "library",
              needsAny: ["sources.manage"],
              keywords: [
                "upload",
                "pdf",
                "docx",
                "video",
                "import",
                "material",
              ],
            },
            {
              href: `${base}/studio/ai`,
              label: "AI Workspace",
              description: "Draft from source documents with assistance",
              icon: "ai",
              needsAny: ["content.view_draft"],
              keywords: ["assistant", "generate", "sources"],
            },
          ],
        },
        {
          label: "Reusable material",
          description: "Blocks and shapes that get used more than once.",
          items: [
            {
              href: `${base}/studio/library`,
              label: "Library",
              description: "Blocks saved for reuse across lessons",
              icon: "library",
              needsAny: ["content.view_draft"],
              keywords: ["blocks", "reusable"],
            },
            {
              href: `${base}/studio/templates`,
              label: "Templates",
              description: "Multi-block shapes with fill-in details",
              icon: "course",
              needsAny: ["content.view_draft"],
              keywords: ["template", "sop", "procedure", "shape"],
            },
          ],
        },
        {
          label: "Publishing",
          description: "How drafts become versions learners can see.",
          items: [
            {
              href: `${base}/studio/review`,
              label: "Review queue",
              description: "Content awaiting approval before publication",
              icon: "review",
              needsAny: ["content.view_draft"],
              keywords: ["approve", "publish", "queue"],
            },
          ],
        },
      ],
    },

    {
      key: "learning",
      label: "Learning",
      href: `${base}/learning`,
      summary:
        "How knowledge becomes structured development, assessment and competency.",
      sections: [
        {
          label: "Curriculum",
          description: "The structures people move through.",
          items: [
            {
              href: `${base}/courses`,
              label: term("course").plural,
              description: "Versioned programs of modules and lessons",
              icon: "course",
              needsAny: ["content.view_draft"],
              keywords: ["program", "lessons", "modules"],
            },
            {
              href: `${base}/learning/paths`,
              label: term("learning_path").plural,
              description: "Sequenced journeys across several courses",
              icon: "path",
              needsAny: ["paths.manage"],
              keywords: ["journey", "sequence", "systems"],
            },
          ],
        },
        {
          label: "Assessment and verification",
          description: "How competency is judged and signed off.",
          items: [
            {
              href: `${base}/assessments`,
              label: term("assessment").plural,
              description: "Evaluations attached to learning content",
              icon: "assessment",
              needsAny: ["assessment.author", "assessment.publish"],
              keywords: ["evaluation", "quiz", "test"],
            },
            {
              href: `${base}/reviews`,
              label: "Reviews",
              description: "Submissions awaiting a named reviewer decision",
              icon: "review",
              needsAny: ["assessment.grade"],
              keywords: ["grading", "sign-off", "queue"],
            },
            {
              href: `${base}/practicals`,
              label: "Practicals",
              description: "Observed sign-offs and terminal defenses",
              icon: "review",
              needsAny: ["assessment.grade"],
              keywords: ["sign-off", "defense", "observation", "practical"],
            },
          ],
        },
        {
          label: "Participation",
          description: "Who is enrolled, and how they are progressing.",
          items: [
            {
              href: `${base}/enrollments`,
              label: term("enrollment").plural,
              description: "Assign programs and track progress",
              icon: "enrollment",
              needsAny: ["enrollment.manage"],
              keywords: ["assign", "progress", "learners"],
            },
            {
              // The learner shell, not an admin route. Every administrator is
              // also a member, so this is the one place the workspace lets you
              // stand where your learners stand. The old sidebar carried it as
              // "My learning"; the redesign dropped it without a disposition,
              // which also stranded the learner-preview walkthrough.
              href: `/${orgSlug}/learn`,
              label: "My learning",
              description: "The workspace as your learners see it",
              icon: "academy",
              // Gated on authorship, not membership. Every member can reach
              // the learner shell directly; its place in the ADMIN workspace
              // is previewing what you are building, so an account with no
              // admin permissions must not gain a domain because of it.
              needsAny: ["content.view_draft"],
              keywords: ["learner", "preview", "academy", "my learning"],
            },
          ],
        },
        {
          label: "Proof",
          description: "Evidence of completion, and when it expires.",
          items: [
            {
              href: `${base}/credentials`,
              label: term("credential").plural,
              description: "Issued certificates, expiry and verification",
              icon: "credential",
              needsAny: ["certificates.manage"],
              keywords: ["certificate", "expiry", "verify", "ceu"],
            },
          ],
        },
      ],
    },

    {
      key: "people",
      label: "People",
      href: `${base}/people`,
      summary: "Who belongs to this organization, and what they may do.",
      sections: [
        {
          label: "Membership",
          description: "People with access to this workspace.",
          items: [
            {
              href: `${base}/members`,
              label: "Members",
              description: "Invite people and manage their status",
              icon: "members",
              needsAny: ["org.members.manage"],
              keywords: ["invite", "staff", "team", "directory"],
            },
          ],
        },
        {
          label: "Access and authority",
          description: "What each person is permitted to do.",
          items: [
            {
              href: `${base}/roles`,
              label: "Roles and permissions",
              description: "Define roles and the permissions they carry",
              icon: "roles",
              needsAny: ["org.roles.manage"],
              keywords: ["access", "authority", "permissions"],
            },
          ],
        },
      ],
    },

    {
      key: "intelligence",
      label: "Intelligence",
      href: `${base}/intelligence`,
      summary: "What the evidence actually supports — and nothing beyond it.",
      sections: [
        {
          label: "Signals",
          description: "Derived from real platform activity only.",
          items: [
            {
              href: `${base}/intelligence/insights`,
              label: "Insights",
              description: "Knowledge scorecard, digest and coaching signals",
              icon: "ai",
              needsAny: ["content.view_draft"],
              keywords: ["nova", "scorecard", "digest", "health"],
            },
          ],
        },
        {
          label: "Activity",
          description: "Counted from the event log, never estimated.",
          items: [
            {
              href: `${base}/ops`,
              label: "Operations",
              description:
                "Live activity from the event log and tester feedback",
              icon: "analytics",
              needsAny: ["analytics.view"],
              keywords: ["metrics", "operations", "feedback", "reports"],
            },
          ],
        },
      ],
    },

    {
      key: "workspace",
      label: "Workspace",
      href: `${base}/workspace`,
      summary: "How this organization is represented, structured and governed.",
      sections: [
        {
          label: "Identity",
          description: "Define how your organization is represented.",
          items: [
            {
              href: `${base}/settings`,
              label: "Organization profile",
              description: "Name, slug, status and basic info",
              icon: "academy",
              needsAny: ["org.manage"],
              keywords: ["profile", "name", "slug", "identity"],
            },
            {
              href: `${base}/branding`,
              label: "Branding",
              description: "Logo, colors and typography",
              icon: "branding",
              needsAny: ["org.branding.manage"],
              keywords: ["theme", "logo", "colors"],
            },
            {
              href: `${base}/terminology`,
              label: "Terminology",
              description: "The vocabulary this workspace speaks",
              icon: "terminology",
              needsAny: ["org.terminology.manage"],
              keywords: ["vocabulary", "labels", "words"],
            },
            {
              href: `${base}/organization`,
              label: "Mission and values",
              description: "Identity, principles and organizational memory",
              icon: "overview",
              // Gated deliberately. The page itself is readable by any member
              // and stays that way — but Workspace is the ADMINISTRATION
              // domain, and an ungated card here put a whole Workspace domain
              // in front of learners who administer nothing. Members meet the
              // organization's mission on Home and in the learner shell.
              needsAny: ["org.manage"],
              keywords: ["mission", "values", "voice", "hub", "story"],
            },
          ],
        },
        {
          label: "Structure",
          description: "How learning is organized inside this workspace.",
          items: [
            {
              href: `${base}/academies`,
              label: term("academy").plural,
              description: "Group learning under distinct organizations",
              icon: "academy",
              needsAny: ["academy.manage"],
              keywords: ["structure", "departments", "divisions"],
            },
          ],
        },
      ],
    },
  ];

  return all
    .map((domain) => ({
      ...domain,
      sections: domain.sections
        .map((section) => ({
          ...section,
          items: section.items.filter(
            (item) => !item.needsAny || item.needsAny.some((p) => held.has(p)),
          ),
        }))
        .filter((section) => section.items.length > 0),
    }))
    .filter((domain) => domain.alwaysVisible || domain.sections.length > 0);
}

/**
 * Which domain owns a path, derived from the model itself.
 *
 * Deliberately not a second lookup table: a hand-maintained route-to-domain
 * map drifts, and a destination that belongs to two domains breaks the
 * promise that the architecture answers "where am I?" on its own.
 *
 * Longest match wins, so `/admin/studio/library` resolves to Library rather
 * than Studio, and `/admin` never swallows everything beneath it.
 */
export function domainForPath(
  domains: readonly Domain[],
  pathname: string,
): Domain | null {
  let bestDomain: Domain | null = null;
  let bestLength = -1;

  const consider = (domain: Domain, href: string) => {
    if (pathname !== href && !pathname.startsWith(`${href}/`)) return;
    if (href.length > bestLength) {
      bestDomain = domain;
      bestLength = href.length;
    }
  };

  for (const domain of domains) {
    consider(domain, domain.href);
    for (const section of domain.sections) {
      for (const item of section.items) consider(domain, item.href);
    }
  }

  return bestDomain;
}

/** Every visible destination, flattened — for the command palette. */
export function allDestinations(domains: readonly Domain[]): DomainItem[] {
  return domains.flatMap((d) => d.sections.flatMap((s) => s.items));
}
