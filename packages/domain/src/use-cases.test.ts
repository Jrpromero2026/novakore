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

describe("the corrected catalog is exact", () => {
  // Pinned literally. These words were decided deliberately — several of them
  // by rejecting an earlier, worse choice — so a silent edit should fail a
  // test rather than quietly change what every new tenant is called.
  const EXPECTED: Record<string, Record<string, string>> = {
    staff_onboarding: {
      course: "SOP",
      module: "Section",
      lesson: "Procedure",
      learner: "Team Member",
      instructor: "Trainer",
      credential: "Sign-off",
    },
    professional_development: {
      course: "Development Program",
      learning_path: "Development Path",
      learner: "Participant",
      credential: "Completion Record",
    },
    qualification: {
      course: "Qualification",
      learning_path: "Qualification Path",
      learner: "Trainee",
      assessment: "Competency Assessment",
      credential: "Qualification",
      instructor: "Assessor",
    },
    compliance: {
      course: "Training Requirement",
      learner: "Employee",
      credential: "Training Record",
      assessment: "Competency Verification",
    },
    continuing_education: {
      course: "Continuing Education Course",
      learner: "Participant",
      credential: "Certificate of Completion",
      certificate: "Certificate of Completion",
    },
    certification: {
      course: "Certification Program",
      learner: "Candidate",
      credential: "Certification",
    },
    coaching: {
      course: "Program",
      learning_path: "Journey",
      learner: "Client",
      instructor: "Coach",
    },
    customer_academy: { course: "Program" },
    partner_network: {
      course: "Playbook",
      academy: "Partner Academy",
      learner: "Partner",
      credential: "Qualification",
    },
    school: { learner: "Student" },
    membership: { learner: "Member" },
    unspecified: {},
  };

  for (const [id, expected] of Object.entries(EXPECTED)) {
    test(`${id} seeds exactly the agreed vocabulary`, () => {
      const actual = Object.fromEntries(
        seedTerminologyFor(id).map((r) => [r.termKey, r.singular]),
      );
      expect(actual).toEqual(expected);
    });
  }

  test("deliberate omissions stay omitted", () => {
    // Each of these was proposed and rejected. Re-adding one would restate a
    // platform default or assert a word the domain does not reliably use.
    const terms = (id: string) => seedTerminologyFor(id).map((r) => r.termKey);
    expect(terms("certification")).not.toContain("assessment");
    expect(terms("school")).not.toContain("instructor");
    expect(terms("school")).not.toContain("credential");
    expect(terms("customer_academy")).not.toContain("learner");
  });
});

describe("signup presentation", () => {
  test("every option has action-oriented wording and a canonical id", () => {
    for (const useCase of USE_CASES) {
      expect(useCase.signupLabel.length, useCase.id).toBeGreaterThan(0);
      expect(USE_CASE_IDS).toContain(useCase.id);
    }
  });

  test("signup wording is unique, so no two options read alike", () => {
    const labels = USE_CASES.map((u) => u.signupLabel);
    expect(new Set(labels).size).toBe(labels.length);
  });

  test('"Something else" is offered last', () => {
    // An escape hatch listed in the middle gets picked by people who would
    // otherwise have read on.
    expect(USE_CASES[USE_CASES.length - 1]!.id).toBe("unspecified");
  });

  test("catalog order is the signup order", () => {
    expect(USE_CASES.map((u) => u.id)).toEqual([...USE_CASE_IDS]);
  });
});

describe("emphasis cannot become a feature gate", () => {
  test("only presentational steps may ever be hidden", () => {
    // The structural version of rule 1. Branding and preview concern how a
    // workspace presents itself publicly, so skipping them is emphasis. Every
    // other step stands for a platform object — content, publishing, people,
    // progress — and hiding one would turn guidance into a product edition.
    //
    // Asserted as an allowlist rather than a denylist so a step added later is
    // protected by default rather than needing to be remembered.
    const PRESENTATIONAL = ["branding", "preview"];
    for (const useCase of USE_CASES) {
      for (const step of useCase.hideChecklistSteps) {
        expect(PRESENTATIONAL, `${useCase.id} hides "${step}"`).toContain(step);
      }
    }
  });

  test("nothing in the catalog mentions permissions or roles", () => {
    // A use case is configuration and emphasis. If a permission code ever
    // appears in this data it has become an authorization input, which is the
    // failure mode the whole design exists to prevent.
    const serialized = JSON.stringify(USE_CASES);
    for (const forbidden of ["permission", "role", "grant", "canAccess"]) {
      expect(serialized.toLowerCase()).not.toContain(forbidden);
    }
  });
});
