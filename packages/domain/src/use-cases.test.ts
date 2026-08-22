import { describe, expect, test } from "vitest";
import {
  USE_CASES,
  USE_CASE_IDS,
  checklistStepApplies,
  findUseCase,
  seedTerminologyFor,
} from "./use-cases";
import { PLATFORM_TERM_DEFAULTS, TERM_KEYS } from "./terminology";

describe("use case catalog", () => {
  test("every declared id has exactly one entry", () => {
    expect(USE_CASES.map((u) => u.id).sort()).toEqual([...USE_CASE_IDS].sort());
    expect(new Set(USE_CASES.map((u) => u.id)).size).toBe(USE_CASES.length);
  });

  test("every overridden term is a real term key", () => {
    // A typo here would silently do nothing at signup rather than fail, so
    // the catalog is checked against the vocabulary it claims to override.
    for (const useCase of USE_CASES) {
      for (const key of Object.keys(useCase.terminology)) {
        expect(TERM_KEYS, `${useCase.id} overrides "${key}"`).toContain(key);
      }
    }
  });

  test("no override merely restates the platform default", () => {
    // Seeding a row that says "a Course is called a Course" adds an entry the
    // customer has to read past on the terminology screen to find their own.
    for (const useCase of USE_CASES) {
      for (const [key, display] of Object.entries(useCase.terminology)) {
        const fallback =
          PLATFORM_TERM_DEFAULTS[key as keyof typeof PLATFORM_TERM_DEFAULTS];
        expect(
          display.singular === fallback.singular &&
            display.plural === fallback.plural,
          `${useCase.id} overrides ${key} with the default wording`,
        ).toBe(false);
      }
    }
  });

  test("choosing a use case never removes a capability", () => {
    // The rule the whole design rests on. A use case may hide GUIDANCE — the
    // checklist steps it does not need — but the checklist is advice, and the
    // three steps that represent the platform's core objects must always be
    // offered, or "setting a default" has quietly become "restricting a mode".
    for (const useCase of USE_CASES) {
      for (const essential of ["org-details", "program", "publish"]) {
        expect(
          useCase.hideChecklistSteps,
          `${useCase.id} hides ${essential}`,
        ).not.toContain(essential);
      }
    }
  });

  test("an internal use case skips the public-facing setup", () => {
    // SOPs and compliance have no public front door, so being told to brand
    // an academy and preview it as a learner is noise.
    expect(checklistStepApplies("staff_onboarding", "branding")).toBe(false);
    expect(checklistStepApplies("compliance", "preview")).toBe(false);
    // …and the steps that DO apply are untouched.
    expect(checklistStepApplies("staff_onboarding", "program")).toBe(true);
  });

  test("an unknown or absent use case hides nothing", () => {
    // Fail open: guidance is not a security boundary, and a stale identifier
    // should never make setup steps vanish.
    for (const id of [null, undefined, "", "not_a_use_case"]) {
      expect(checklistStepApplies(id, "branding")).toBe(true);
      expect(seedTerminologyFor(id)).toEqual([]);
    }
  });

  test("seeding produces rows the terminology table can accept", () => {
    const rows = seedTerminologyFor("staff_onboarding");
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(TERM_KEYS).toContain(row.termKey);
      expect(row.singular.length).toBeGreaterThan(0);
      expect(row.plural.length).toBeGreaterThan(0);
    }
    // The case that motivated the feature: an SOP is a course wearing the
    // word its organization actually uses.
    expect(rows.find((r) => r.termKey === "course")?.singular).toBe("SOP");
  });

  test('"not sure yet" seeds nothing at all', () => {
    expect(seedTerminologyFor("unspecified")).toEqual([]);
    expect(findUseCase("unspecified")?.terminology).toEqual({});
  });
});
