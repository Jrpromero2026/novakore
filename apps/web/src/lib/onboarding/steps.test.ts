import { describe, expect, test } from "vitest";
import { PLATFORM_TERM_DEFAULTS, type Permission } from "@novakore/domain";
import {
  CHECKLIST_STEPS,
  resolveChecklist,
  type OrgOnboardingSignals,
} from "./steps";

const term = (key: keyof typeof PLATFORM_TERM_DEFAULTS) =>
  PLATFORM_TERM_DEFAULTS[key];

const ALL_PERMISSIONS: Permission[] = [
  "org.manage",
  "org.branding.manage",
  "org.members.manage",
  "paths.manage",
  "content.author",
  "content.view_draft",
  "content.publish",
  "enrollment.manage",
  "analytics.view",
];

const emptySignals: OrgOnboardingSignals = {
  identityConfigured: false,
  brandingConfigured: false,
  journeys: 0,
  courses: 0,
  modules: 0,
  lessons: 0,
  lessonsWithContent: 0,
  publishedCourses: 0,
  publishedLessons: 0,
  otherMembers: 0,
  previewOpened: false,
  progressReviewed: false,
};

const fullSignals: OrgOnboardingSignals = {
  identityConfigured: true,
  brandingConfigured: true,
  journeys: 2,
  courses: 3,
  modules: 4,
  lessons: 9,
  lessonsWithContent: 12,
  publishedCourses: 1,
  publishedLessons: 5,
  otherMembers: 7,
  previewOpened: true,
  progressReviewed: true,
};

const BASE = "/bfh/admin";

describe("checklist completion resolvers", () => {
  test("a brand-new organization has zero complete steps", () => {
    const view = resolveChecklist(emptySignals, ALL_PERMISSIONS, term, BASE);
    expect(view.totalCount).toBe(CHECKLIST_STEPS.length);
    expect(view.completedCount).toBe(0);
    expect(view.percentComplete).toBe(0);
    expect(view.allComplete).toBe(false);
  });

  test("a fully launched organization completes every step", () => {
    const view = resolveChecklist(fullSignals, ALL_PERMISSIONS, term, BASE);
    expect(view.completedCount).toBe(view.totalCount);
    expect(view.percentComplete).toBe(100);
    expect(view.allComplete).toBe(true);
    expect(view.nextStepId).toBeNull();
  });

  test.each([
    ["org-details", { identityConfigured: true }],
    ["branding", { brandingConfigured: true }],
    ["journey", { journeys: 1 }],
    ["program", { courses: 1 }],
    ["phase", { modules: 1 }],
    ["publish", { publishedCourses: 1 }],
    ["invite", { otherMembers: 1 }],
    ["preview", { previewOpened: true }],
    ["progress", { progressReviewed: true }],
  ] as const)("%s completes from its real signal", (stepId, patch) => {
    const view = resolveChecklist(
      { ...emptySignals, ...patch },
      ALL_PERMISSIONS,
      term,
      BASE,
    );
    const step = view.steps.find((s) => s.id === stepId)!;
    expect(step.complete).toBe(true);
    expect(view.completedCount).toBe(1);
  });

  test("a lesson without content blocks is not 'meaningful content'", () => {
    const bare = resolveChecklist(
      { ...emptySignals, lessons: 1, lessonsWithContent: 0 },
      ALL_PERMISSIONS,
      term,
      BASE,
    );
    expect(bare.steps.find((s) => s.id === "lesson")!.complete).toBe(false);

    const real = resolveChecklist(
      { ...emptySignals, lessons: 1, lessonsWithContent: 1 },
      ALL_PERMISSIONS,
      term,
      BASE,
    );
    expect(real.steps.find((s) => s.id === "lesson")!.complete).toBe(true);
  });

  test("publish completes from published lessons even without a published course", () => {
    const view = resolveChecklist(
      { ...emptySignals, publishedLessons: 1 },
      ALL_PERMISSIONS,
      term,
      BASE,
    );
    expect(view.steps.find((s) => s.id === "publish")!.complete).toBe(true);
  });

  test("percentage is rounded from completed over visible total", () => {
    const view = resolveChecklist(
      { ...emptySignals, journeys: 1, courses: 1, modules: 1 },
      ALL_PERMISSIONS,
      term,
      BASE,
    );
    expect(view.completedCount).toBe(3);
    expect(view.percentComplete).toBe(Math.round((3 / view.totalCount) * 100));
  });
});

describe("recommended next step", () => {
  test("the first incomplete step is recommended", () => {
    const view = resolveChecklist(
      { ...emptySignals, identityConfigured: true, brandingConfigured: true },
      ALL_PERMISSIONS,
      term,
      BASE,
    );
    expect(view.nextStepId).toBe("journey");
  });

  test("skipped-ahead completion still recommends the earliest gap", () => {
    const view = resolveChecklist(
      { ...emptySignals, journeys: 1, courses: 1 },
      ALL_PERMISSIONS,
      term,
      BASE,
    );
    expect(view.nextStepId).toBe("org-details");
  });
});

describe("permission filtering", () => {
  test("steps the member cannot perform are hidden entirely", () => {
    const view = resolveChecklist(
      emptySignals,
      ["content.author", "content.view_draft"],
      term,
      BASE,
    );
    const ids = view.steps.map((s) => s.id);
    expect(ids).toContain("program");
    expect(ids).toContain("lesson");
    expect(ids).not.toContain("org-details");
    expect(ids).not.toContain("branding");
    expect(ids).not.toContain("invite");
  });

  test("no permissions means no checklist at all", () => {
    const view = resolveChecklist(emptySignals, [], term, BASE);
    expect(view.totalCount).toBe(0);
    expect(view.allComplete).toBe(false);
    expect(view.percentComplete).toBe(0);
  });

  test("percentages are computed over the visible subset only", () => {
    const view = resolveChecklist(
      { ...emptySignals, brandingConfigured: true },
      ["org.branding.manage"],
      term,
      BASE,
    );
    expect(view.totalCount).toBe(1);
    expect(view.percentComplete).toBe(100);
    expect(view.allComplete).toBe(true);
  });
});

describe("view model", () => {
  test("titles and hrefs resolve through terminology and the admin base", () => {
    const view = resolveChecklist(emptySignals, ALL_PERMISSIONS, term, BASE);
    const journey = view.steps.find((s) => s.id === "journey")!;
    expect(journey.title).toContain("Learning Path");
    expect(journey.href).toBe(`${BASE}/learning`);
    const preview = view.steps.find((s) => s.id === "preview")!;
    expect(preview.href).toBe("/bfh/learn");
  });

  test("tenant terminology overrides flow into step copy", () => {
    const bfhTerm = (key: keyof typeof PLATFORM_TERM_DEFAULTS) =>
      key === "learning_path"
        ? { singular: "Journey", plural: "Journeys" }
        : PLATFORM_TERM_DEFAULTS[key];
    const view = resolveChecklist(emptySignals, ALL_PERMISSIONS, bfhTerm, BASE);
    expect(view.steps.find((s) => s.id === "journey")!.title).toContain(
      "Journey",
    );
  });

  test("every step carries explanation, why-it-matters, and a walkthrough id", () => {
    const view = resolveChecklist(emptySignals, ALL_PERMISSIONS, term, BASE);
    for (const step of view.steps) {
      expect(step.explanation.length).toBeGreaterThan(10);
      expect(step.whyItMatters.length).toBeGreaterThan(10);
      expect(step.walkthroughId.length).toBeGreaterThan(0);
    }
  });
});
