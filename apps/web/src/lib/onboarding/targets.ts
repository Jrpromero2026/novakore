/**
 * Durable walkthrough target identifiers (docs/architecture/onboarding.md).
 *
 * Every element a walkthrough can highlight carries a `data-tour-id`
 * attribute stamped via `tourTarget(...)`. These identifiers are the ONLY
 * way tours address the DOM — never positional selectors, visible text, or
 * styling classes. Keys are frozen: renaming one is a breaking change for
 * every registry step that references it (the registry test enforces
 * referential integrity).
 *
 * Server-safe: no React, no browser globals.
 */

export const TOUR_TARGETS = {
  // Global navigation. The previous eleven `admin-sidebar-*` ids addressed a
  // sidebar that no longer renders, which left eight walkthrough steps
  // falling through to missing-target recovery. Tours anchor to the DOMAIN
  // link — present on every admin route — and complete on arrival at the
  // real destination, so the shell's second click needs no second anchor.
  navDomainHome: "nav-domain-home",
  navDomainKnowledge: "nav-domain-knowledge",
  navDomainLearning: "nav-domain-learning",
  navDomainPeople: "nav-domain-people",
  navDomainIntelligence: "nav-domain-intelligence",
  navDomainWorkspace: "nav-domain-workspace",

  // Settings / organization hub
  settingsNameField: "settings-org-name-field",
  settingsSaveButton: "settings-org-name-save",
  orgIdentityPanel: "org-identity-panel",

  // Branding
  brandingStudio: "branding-studio-panel",

  // Learning paths (journeys)
  learningCreateSystem: "learning-create-system",
  learningCreatePath: "learning-create-path",
  pathTitleField: "path-title-field",
  pathCreateButton: "path-create-button",

  // Courses (programs)
  coursesCreateButton: "courses-create-button",
  courseTitleField: "course-title-field",
  courseCreateSubmit: "course-create-submit",
  courseList: "courses-list",

  // Course builder (modules/phases + lessons + publish)
  moduleCreateButton: "module-create-button",
  lessonCreateButton: "lesson-create-button",
  publishControl: "course-publish-control",

  // Members
  inviteEmailField: "invite-member-email-field",
  inviteSubmitButton: "invite-member-submit",

  // Progress / reporting
  enrollmentsOverview: "enrollments-overview",

  // Learner preview
  learnerPreviewSurface: "learner-preview-surface",

  // Dashboard
  launchChecklist: "academy-launch-checklist",
  helpMenu: "workspace-help-menu",
} as const;

export type TourTargetId = (typeof TOUR_TARGETS)[keyof typeof TOUR_TARGETS];

/** Attribute name — single definition so engine and stamps can't drift. */
export const TOUR_ATTR = "data-tour-id";

/** Spread onto any JSX element to make it tour-addressable. */
export function tourTarget(id: TourTargetId): { [TOUR_ATTR]: TourTargetId } {
  return { [TOUR_ATTR]: id };
}

/* ---------------------------------------------------------------------------
 * Tour state — server-rendered real counts the engine can read from the DOM
 * to detect that an action truly happened (e.g. a journey now exists after
 * the revalidated page re-renders). Never a simulated or client-set value.
 * ------------------------------------------------------------------------- */

export const TOUR_STATE_PREFIX = "data-tour-state-";

/** Spread onto a server-rendered element: real org counts for detection. */
export function tourState(
  values: Record<string, number | boolean>,
): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const [key, value] of Object.entries(values)) {
    attrs[`${TOUR_STATE_PREFIX}${key}`] = String(
      typeof value === "boolean" ? Number(value) : value,
    );
  }
  return attrs;
}

/** Read a numeric tour-state value from the live document (client only). */
export function readTourState(doc: Document, key: string): number | null {
  const el = doc.querySelector(`[${TOUR_STATE_PREFIX}${key}]`);
  const raw = el?.getAttribute(`${TOUR_STATE_PREFIX}${key}`);
  if (raw == null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}
