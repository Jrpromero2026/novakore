import type { Permission, TermDisplay, TermKey } from "@novakore/domain";

/**
 * Academy Launch checklist — step definitions + pure completion logic.
 *
 * Completion is DERIVED from real organization signals gathered server-side
 * (`lib/data/onboarding.ts`); the two experience steps (preview, progress)
 * complete from explicit onboarding events. Nothing here talks to the
 * database — pure functions, fully unit-testable.
 *
 * Copy resolves through the tenant terminology system so Built For Her
 * Academy language (e.g. Course→Program, Module→Phase) applies without any
 * code change.
 */

export const CHECKLIST_STEP_IDS = [
  "org-details",
  "branding",
  "journey",
  "program",
  "phase",
  "lesson",
  "publish",
  "preview",
  "invite",
  "progress",
] as const;

export type ChecklistStepId = (typeof CHECKLIST_STEP_IDS)[number];

/** Real, RLS-scoped signals about one organization. All counts are org-scoped. */
export interface OrgOnboardingSignals {
  /** organization_settings.settings.identity has meaningful content. */
  identityConfigured: boolean;
  /** organization_branding has a draft or published theme, or display name. */
  brandingConfigured: boolean;
  /** Non-archived learning_paths. */
  journeys: number;
  /** Non-archived courses. */
  courses: number;
  /** Non-archived modules. */
  modules: number;
  /** Non-archived lessons. */
  lessons: number;
  /** Lessons with at least one content block (meaningful content). */
  lessonsWithContent: number;
  /** Courses with a published version. */
  publishedCourses: number;
  /** Published lessons. */
  publishedLessons: number;
  /** Memberships beyond the caller: invited or active. */
  otherMembers: number;
  /** Explicit onboarding.preview.opened events recorded for the org. */
  previewOpened: boolean;
  /** Explicit onboarding.progress.reviewed events recorded for the org. */
  progressReviewed: boolean;
}

export type TermResolver = (key: TermKey) => TermDisplay;

export interface ChecklistStepDefinition {
  id: ChecklistStepId;
  /** Walkthrough launched by "Show me" (registry id). */
  walkthroughId: string;
  /** Any-of permission gate — hidden entirely when none are held. */
  needsAny: Permission[];
  /** Destination for "Take me there". */
  href: (base: string) => string;
  title: (term: TermResolver) => string;
  explanation: (term: TermResolver) => string;
  whyItMatters: (term: TermResolver) => string;
  estimatedMinutes?: number;
  complete: (signals: OrgOnboardingSignals) => boolean;
}

export const CHECKLIST_STEPS: ChecklistStepDefinition[] = [
  {
    id: "org-details",
    walkthroughId: "org-details",
    needsAny: ["org.manage"],
    href: (base) => `${base}/organization`,
    title: () => "Configure organization details",
    explanation: () =>
      "Set your organization's mission, values, and voice so the workspace reflects who you are.",
    whyItMatters: () =>
      "Identity guides authors and appears across the workspace — it is the foundation every other step builds on.",
    estimatedMinutes: 5,
    complete: (s) => s.identityConfigured,
  },
  {
    id: "branding",
    walkthroughId: "branding",
    needsAny: ["org.branding.manage"],
    href: (base) => `${base}/branding`,
    title: () => "Add organization branding",
    explanation: () =>
      "Choose your accent colors and display name so learners see your brand, not a generic platform.",
    whyItMatters: () =>
      "A branded workspace builds trust with learners from their very first sign-in.",
    estimatedMinutes: 10,
    complete: (s) => s.brandingConfigured,
  },
  {
    id: "journey",
    walkthroughId: "create-journey",
    needsAny: ["paths.manage"],
    href: (base) => `${base}/learning`,
    title: (term) => `Create your first ${term("learning_path").singular}`,
    explanation: (term) =>
      `A ${term("learning_path").singular} is the complete learning experience — it can contain multiple ${term("course").plural}.`,
    whyItMatters: () =>
      "Everything learners do lives inside one — for example Coach Certification or Leadership Development.",
    estimatedMinutes: 5,
    complete: (s) => s.journeys >= 1,
  },
  {
    id: "program",
    walkthroughId: "create-program",
    needsAny: ["content.author", "content.view_draft"],
    href: (base) => `${base}/courses`,
    title: (term) => `Create your first ${term("course").singular}`,
    explanation: (term) =>
      `A ${term("course").singular} is a major section of learning that lives inside a ${term("learning_path").singular}.`,
    whyItMatters: (term) =>
      `${term("course").plural} are versioned — learners always see exactly what you published.`,
    estimatedMinutes: 5,
    complete: (s) => s.courses >= 1,
  },
  {
    id: "phase",
    walkthroughId: "create-phase",
    needsAny: ["content.author", "content.view_draft"],
    href: (base) => `${base}/courses`,
    title: (term) => `Add a ${term("module").singular}`,
    explanation: (term) =>
      `A ${term("module").singular} organizes a ${term("course").singular} into a sequence or milestone.`,
    whyItMatters: () =>
      "Clear structure helps learners understand where they are and what comes next.",
    estimatedMinutes: 3,
    complete: (s) => s.modules >= 1,
  },
  {
    id: "lesson",
    walkthroughId: "create-lesson",
    needsAny: ["content.author", "content.view_draft"],
    href: (base) => `${base}/courses`,
    title: (term) => `Create your first ${term("lesson").singular}`,
    explanation: (term) =>
      `A ${term("lesson").singular} holds the actual learning content — video, reading, activities, and reflection.`,
    whyItMatters: () =>
      "This is the moment your knowledge becomes something a learner can experience.",
    estimatedMinutes: 15,
    complete: (s) => s.lessons >= 1,
  },
  {
    id: "publish",
    walkthroughId: "publish-content",
    needsAny: ["content.publish"],
    href: (base) => `${base}/courses`,
    title: () => "Publish learning content",
    explanation: () =>
      "Draft changes stay private until published. Publishing freezes a version learners can enroll in.",
    whyItMatters: () =>
      "Nothing reaches a learner until you publish — this is the safety line between drafting and delivery.",
    estimatedMinutes: 2,
    complete: (s) => s.publishedCourses >= 1 || s.publishedLessons >= 1,
  },
  {
    id: "preview",
    walkthroughId: "learner-preview",
    needsAny: ["content.view_draft"],
    href: (base) => base.replace(/\/admin$/, "/learn"),
    title: (term) => `Preview the ${term("learner").singular} experience`,
    explanation: (term) =>
      `Open "My learning" to see the workspace exactly as a ${term("learner").singular} does.`,
    whyItMatters: () =>
      "Seeing your content through learner eyes catches confusion before your first real learner does.",
    estimatedMinutes: 5,
    complete: (s) => s.previewOpened,
  },
  {
    id: "invite",
    walkthroughId: "invite-learner",
    needsAny: ["org.members.manage"],
    href: (base) => `${base}/members`,
    title: (term) => `Invite your first ${term("learner").singular}`,
    explanation: () =>
      "Send an email invitation. They join as soon as they sign in and accept.",
    whyItMatters: () =>
      "An academy becomes real the moment the first learner walks through the door.",
    estimatedMinutes: 2,
    complete: (s) => s.otherMembers >= 1,
  },
  {
    id: "progress",
    walkthroughId: "review-progress",
    needsAny: ["enrollment.manage", "analytics.view"],
    href: (base) => `${base}/enrollments`,
    title: (term) => `Review ${term("learner").singular} progress`,
    explanation: () =>
      "Open enrollments to see who is learning, how far they've come, and who needs a nudge.",
    whyItMatters: () =>
      "Operating an academy means noticing progress and stalls early — this is your ongoing rhythm.",
    estimatedMinutes: 3,
    complete: (s) => s.progressReviewed,
  },
];

// ---------------------------------------------------------------------------
// Pure resolution
// ---------------------------------------------------------------------------

/** Serializable view model — computed on the server, rendered by the client. */
export interface ChecklistStepView {
  id: ChecklistStepId;
  walkthroughId: string;
  href: string;
  title: string;
  explanation: string;
  whyItMatters: string;
  estimatedMinutes?: number;
  complete: boolean;
}

export interface ChecklistView {
  steps: ChecklistStepView[];
  completedCount: number;
  totalCount: number;
  /** 0–100, integer. */
  percentComplete: number;
  /** First incomplete step (recommended next action), if any. */
  nextStepId: ChecklistStepId | null;
  allComplete: boolean;
}

/**
 * Resolve the checklist for one member: permission-filter the steps, apply
 * derived completion from real signals, compute progress + the next step.
 */
export function resolveChecklist(
  signals: OrgOnboardingSignals,
  permissions: ReadonlySet<Permission> | readonly Permission[],
  term: TermResolver,
  base: string,
): ChecklistView {
  const held = new Set(permissions);
  const steps = CHECKLIST_STEPS.filter((step) =>
    step.needsAny.some((p) => held.has(p)),
  ).map<ChecklistStepView>((step) => ({
    id: step.id,
    walkthroughId: step.walkthroughId,
    href: step.href(base),
    title: step.title(term),
    explanation: step.explanation(term),
    whyItMatters: step.whyItMatters(term),
    estimatedMinutes: step.estimatedMinutes,
    complete: step.complete(signals),
  }));

  const completedCount = steps.filter((s) => s.complete).length;
  const totalCount = steps.length;
  return {
    steps,
    completedCount,
    totalCount,
    percentComplete:
      totalCount === 0 ? 0 : Math.round((completedCount / totalCount) * 100),
    nextStepId: steps.find((s) => !s.complete)?.id ?? null,
    allComplete: totalCount > 0 && completedCount === totalCount,
  };
}
