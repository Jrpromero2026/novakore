import type { Permission, TermDisplay, TermKey } from "@novakore/domain";
import { readTourState, TOUR_TARGETS, type TourTargetId } from "./targets";
import type { ChecklistStepId } from "./steps";

/**
 * Centralized walkthrough registry (docs/architecture/onboarding.md).
 *
 * Every guided walkthrough is DATA: the engine
 * (`components/onboarding/walkthrough.tsx`) renders exclusively from these
 * definitions — no per-page tour logic anywhere. Adding a walkthrough is a
 * new entry here (plus target stamps if the elements are new).
 *
 * Detection honesty: `completeWhen` predicates read only real, server-
 * rendered state (`data-tour-state-*` counts re-rendered after the user's
 * own action) or the live route. The engine never simulates an action and
 * never creates content.
 */

export type TermResolver = (key: TermKey) => TermDisplay;

export type CoachmarkPlacement = "top" | "bottom" | "left" | "right";

export interface WalkthroughStepContext {
  /** Current pathname. */
  pathname: string;
  /** Admin base for the org: /{orgSlug}/admin */
  base: string;
  doc: Document;
}

export interface WalkthroughStepDefinition {
  id: string;
  /** Route this step lives on. Prefix match ("startsWith") applies. */
  route: (base: string) => string;
  target: TourTargetId;
  /** Highlighted instead when the primary target is absent. */
  fallbackTarget?: TourTargetId;
  placement: CoachmarkPlacement;
  title: (term: TermResolver) => string;
  body: (term: TermResolver) => string;
  /**
   * "next"      — informational; user advances with the Next button.
   * "condition" — waits for the user's real action; `completeWhen` polls
   *               live route/DOM state and auto-advances when true.
   */
  advance: "next" | "condition";
  completeWhen?: (ctx: WalkthroughStepContext) => boolean;
  /** Shown while a condition step waits (e.g. "Waiting for the journey…"). */
  waitHint?: (term: TermResolver) => string;
  /** Open the mobile nav drawer before resolving the target (sidebar steps). */
  openMobileNav?: boolean;
}

export interface WalkthroughDefinition {
  id: string;
  /** Bump to invalidate stored per-member progress for this walkthrough. */
  version: number;
  title: (term: TermResolver) => string;
  description: (term: TermResolver) => string;
  /** Checklist step this walkthrough teaches (links "Show me"). */
  checklistStep?: ChecklistStepId;
  /** Any-of permission gate; unavailable walkthroughs are never rendered. */
  needsAny: Permission[];
  steps: WalkthroughStepDefinition[];
}

const onRoute =
  (path: string) =>
  (base: string): string =>
    `${base}${path}`;

/** Sidebar step factory — the one pattern every walkthrough starts with. */
function sidebarStep(
  target: TourTargetId,
  path: string,
  title: (term: TermResolver) => string,
  body: (term: TermResolver) => string,
): WalkthroughStepDefinition {
  return {
    id: `nav`,
    route: (base) => base,
    target,
    placement: "right",
    title,
    body,
    advance: "condition",
    completeWhen: ({ pathname, base }) => pathname.startsWith(`${base}${path}`),
    waitHint: () => "Click the highlighted navigation item to continue.",
    openMobileNav: true,
  };
}

const stateAtLeast =
  (key: string, min: number) =>
  ({ doc }: WalkthroughStepContext): boolean => {
    const value = readTourState(doc, key);
    return value !== null && value >= min;
  };

export const WALKTHROUGHS: WalkthroughDefinition[] = [
  {
    id: "org-details",
    version: 1,
    title: () => "Configure organization details",
    description: () =>
      "Set the mission, values, and voice that shape your workspace.",
    checklistStep: "org-details",
    needsAny: ["org.manage"],
    steps: [
      sidebarStep(
        TOUR_TARGETS.navOrganization,
        "/organization",
        () => "Open the Organization hub",
        () =>
          "The Organization hub is where your identity lives — who you are, what you stand for, and how you speak.",
      ),
      {
        id: "identity",
        route: onRoute("/organization"),
        target: TOUR_TARGETS.orgIdentityPanel,
        placement: "top",
        title: () => "Describe your organization",
        body: () =>
          "Add your mission, vision, and values here, then save. These guide authors and appear across the workspace.",
        advance: "condition",
        completeWhen: stateAtLeast("identity", 1),
        waitHint: () => "Waiting for your identity details to be saved…",
      },
    ],
  },
  {
    id: "branding",
    version: 1,
    title: () => "Add organization branding",
    description: () => "Give the workspace your colors and name.",
    checklistStep: "branding",
    needsAny: ["org.branding.manage"],
    steps: [
      sidebarStep(
        TOUR_TARGETS.navBranding,
        "/branding",
        () => "Open Branding",
        () =>
          "Branding controls the accent colors, display name, and logo learners see everywhere.",
      ),
      {
        id: "studio",
        route: onRoute("/branding"),
        target: TOUR_TARGETS.brandingStudio,
        placement: "top",
        title: () => "Craft your brand theme",
        body: () =>
          "Pick your accents and save a draft — publish when it feels right. Draft themes never leak to learners.",
        advance: "condition",
        completeWhen: stateAtLeast("branding", 1),
        waitHint: () => "Waiting for a saved brand theme…",
      },
    ],
  },
  {
    id: "create-journey",
    version: 1,
    title: (term) => `Create a ${term("learning_path").singular}`,
    description: (term) =>
      `${term("learning_path").plural} are complete learning experiences that contain ${term("course").plural}.`,
    checklistStep: "journey",
    needsAny: ["paths.manage"],
    steps: [
      sidebarStep(
        TOUR_TARGETS.navLearning,
        "/learning",
        (term) => `Open ${term("learning_path").plural}`,
        (term) =>
          `This is where you design ${term("learning_path").plural} — the end-to-end experiences your learners move through.`,
      ),
      {
        id: "create",
        route: onRoute("/learning"),
        target: TOUR_TARGETS.learningCreatePath,
        fallbackTarget: TOUR_TARGETS.learningCreateSystem,
        placement: "bottom",
        title: (term) => `Create the ${term("learning_path").singular}`,
        body: (term) =>
          `Give it a title and a short slug, then create it. (If you don't have a ${term("learning_system").singular} yet, create that container first — it groups your ${term("learning_path").plural}.)`,
        advance: "condition",
        completeWhen: stateAtLeast("paths", 1),
        waitHint: (term) =>
          `Waiting for your first ${term("learning_path").singular}…`,
      },
    ],
  },
  {
    id: "create-program",
    version: 1,
    title: (term) => `Create a ${term("course").singular}`,
    description: (term) =>
      `A ${term("course").singular} is a major, versioned section of a ${term("learning_path").singular}.`,
    checklistStep: "program",
    needsAny: ["content.author", "content.view_draft"],
    steps: [
      sidebarStep(
        TOUR_TARGETS.navCourses,
        "/courses",
        (term) => `Open ${term("course").plural}`,
        (term) =>
          `${term("course").plural} hold your structured content. Learners enroll into published versions.`,
      ),
      {
        id: "create",
        route: onRoute("/courses"),
        target: TOUR_TARGETS.coursesCreateButton,
        placement: "bottom",
        title: (term) => `Create a ${term("course").singular} draft`,
        body: (term) =>
          `Open the create panel, then give your ${term("course").singular} a title and slug. It starts as a private draft.`,
        advance: "condition",
        completeWhen: stateAtLeast("courses", 1),
        waitHint: (term) =>
          `Waiting for your first ${term("course").singular}…`,
      },
    ],
  },
  {
    id: "create-phase",
    version: 1,
    title: (term) => `Add a ${term("module").singular}`,
    description: (term) =>
      `${term("module").plural} give a ${term("course").singular} its sequence.`,
    checklistStep: "phase",
    needsAny: ["content.author", "content.view_draft"],
    steps: [
      sidebarStep(
        TOUR_TARGETS.navCourses,
        "/courses",
        (term) => `Open ${term("course").plural}`,
        (term) =>
          `${term("module").plural} live inside a ${term("course").singular}.`,
      ),
      {
        id: "open-course",
        route: onRoute("/courses"),
        target: TOUR_TARGETS.courseList,
        placement: "top",
        title: (term) => `Open your ${term("course").singular}`,
        body: (term) =>
          `Click a ${term("course").singular} to open its builder — that's where structure and content live.`,
        advance: "condition",
        completeWhen: ({ pathname, base }) =>
          /\/courses\/[0-9a-f-]{36}/i.test(pathname.slice(base.length)),
        waitHint: (term) => `Waiting for a ${term("course").singular} to open…`,
      },
      {
        id: "create",
        route: (base) => `${base}/courses/`,
        target: TOUR_TARGETS.moduleCreateButton,
        placement: "bottom",
        title: (term) => `Add the first ${term("module").singular}`,
        body: (term) =>
          `Name it after a milestone — for example "Foundations". ${term("lesson").plural} attach to ${term("module").plural}.`,
        advance: "condition",
        completeWhen: stateAtLeast("modules", 1),
        waitHint: (term) =>
          `Waiting for your first ${term("module").singular}…`,
      },
    ],
  },
  {
    id: "create-lesson",
    version: 1,
    title: (term) => `Create a ${term("lesson").singular}`,
    description: (term) =>
      `${term("lesson").plural} hold the actual learning experience.`,
    checklistStep: "lesson",
    needsAny: ["content.author", "content.view_draft"],
    steps: [
      {
        id: "open-course",
        route: onRoute("/courses"),
        target: TOUR_TARGETS.courseList,
        placement: "top",
        title: (term) => `Open your ${term("course").singular}`,
        body: (term) =>
          `${term("lesson").plural} are created inside a ${term("course").singular}'s builder.`,
        advance: "condition",
        completeWhen: ({ pathname, base }) =>
          /\/courses\/[0-9a-f-]{36}/i.test(pathname.slice(base.length)),
        waitHint: (term) => `Waiting for a ${term("course").singular} to open…`,
      },
      {
        id: "create",
        route: (base) => `${base}/courses/`,
        target: TOUR_TARGETS.lessonCreateButton,
        placement: "bottom",
        title: (term) => `Create the ${term("lesson").singular}`,
        body: (term) =>
          `Give it a title inside a ${term("module").singular}. Then open it to add content blocks — video, reading, activities.`,
        advance: "condition",
        completeWhen: stateAtLeast("lessons", 1),
        waitHint: (term) =>
          `Waiting for your first ${term("lesson").singular}…`,
      },
    ],
  },
  {
    id: "publish-content",
    version: 1,
    title: () => "Publish learning content",
    description: () =>
      "Freeze a version of your draft so learners can experience it.",
    checklistStep: "publish",
    needsAny: ["content.publish"],
    steps: [
      {
        id: "open-course",
        route: onRoute("/courses"),
        target: TOUR_TARGETS.courseList,
        placement: "top",
        title: (term) => `Open the ${term("course").singular} to publish`,
        body: () =>
          "Publishing happens in the builder, so you can see exactly what will go live.",
        advance: "condition",
        completeWhen: ({ pathname, base }) =>
          /\/courses\/[0-9a-f-]{36}/i.test(pathname.slice(base.length)),
        waitHint: (term) => `Waiting for a ${term("course").singular} to open…`,
      },
      {
        id: "publish",
        route: (base) => `${base}/courses/`,
        target: TOUR_TARGETS.publishControl,
        placement: "top",
        title: () => "Publish this version",
        body: (term) =>
          `Publishing pins the exact ${term("lesson").singular} versions learners will see. Draft edits stay private until the next publish.`,
        advance: "condition",
        completeWhen: stateAtLeast("published", 1),
        waitHint: () => "Waiting for the version to publish…",
      },
    ],
  },
  {
    id: "learner-preview",
    version: 1,
    title: (term) => `Preview the ${term("learner").singular} experience`,
    description: (term) =>
      `See the workspace exactly as your ${term("learner").plural} will.`,
    checklistStep: "preview",
    needsAny: ["content.view_draft"],
    steps: [
      {
        id: "nav",
        route: (base) => base,
        target: TOUR_TARGETS.navMyLearning,
        placement: "right",
        title: () => 'Open "My learning"',
        body: (term) =>
          `This is the ${term("learner").singular} surface. You are a member of this organization too, so you can walk the same path your ${term("learner").plural} do.`,
        advance: "condition",
        completeWhen: ({ pathname, base }) =>
          pathname.startsWith(base.replace(/\/admin$/, "/learn")),
        waitHint: () => "Click the highlighted navigation item to continue.",
        openMobileNav: true,
      },
      {
        id: "preview",
        route: (base) => base.replace(/\/admin$/, "/learn"),
        target: TOUR_TARGETS.learnerPreviewSurface,
        placement: "top",
        title: () => "This is what learners see",
        body: (term) =>
          `Enrollments, ${term("course").plural}, and progress — from the ${term("learner").singular} side. Your visit here completes the checklist step automatically.`,
        advance: "next",
      },
    ],
  },
  {
    id: "invite-learner",
    version: 1,
    title: (term) => `Invite a ${term("learner").singular}`,
    description: () => "Bring the first real person into your academy.",
    checklistStep: "invite",
    needsAny: ["org.members.manage"],
    steps: [
      sidebarStep(
        TOUR_TARGETS.navMembers,
        "/members",
        () => "Open Members",
        () =>
          "Members are everyone in your organization — learners, authors, and admins, each with their own roles.",
      ),
      {
        id: "invite",
        route: onRoute("/members"),
        target: TOUR_TARGETS.inviteEmailField,
        placement: "bottom",
        title: () => "Send the invitation",
        body: (term) =>
          `Enter their email and send. After they accept, assign them the ${term("learner").singular} role from their member row.`,
        advance: "condition",
        completeWhen: stateAtLeast("others", 1),
        waitHint: () => "Waiting for the invitation to be sent…",
      },
    ],
  },
  {
    id: "review-progress",
    version: 1,
    title: (term) => `Review ${term("learner").singular} progress`,
    description: () => "Your ongoing operating rhythm.",
    checklistStep: "progress",
    needsAny: ["enrollment.manage", "analytics.view"],
    steps: [
      sidebarStep(
        TOUR_TARGETS.navEnrollments,
        "/enrollments",
        () => "Open Enrollments",
        (term) =>
          `Enrollments connect ${term("learner").plural} to content and carry their progress.`,
      ),
      {
        id: "overview",
        route: onRoute("/enrollments"),
        target: TOUR_TARGETS.enrollmentsOverview,
        placement: "top",
        title: () => "Watch progress here",
        body: (term) =>
          `Each enrollment shows status and completion. Check in regularly — stalled ${term("learner").plural} usually just need a nudge. Visiting this page completes the checklist step.`,
        advance: "next",
      },
    ],
  },
];

/** Registry lookup (undefined when a walkthrough was retired). */
export function getWalkthrough(id: string): WalkthroughDefinition | undefined {
  return WALKTHROUGHS.find((w) => w.id === id);
}

/** Permission-filtered registry view for the current member. */
export function availableWalkthroughs(
  permissions: ReadonlySet<Permission> | readonly Permission[],
): WalkthroughDefinition[] {
  const held = new Set(permissions);
  return WALKTHROUGHS.filter((w) => w.needsAny.some((p) => held.has(p)));
}
