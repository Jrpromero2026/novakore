import { describe, expect, test } from "vitest";
import { PLATFORM_TERM_DEFAULTS, TERM_KEYS, resolveTerm } from "./terminology";

describe("terminology overlay (ADR-003)", () => {
  test("every canonical key has a platform default", () => {
    for (const key of TERM_KEYS) {
      const display = PLATFORM_TERM_DEFAULTS[key];
      expect(display.singular.length).toBeGreaterThan(0);
      expect(display.plural.length).toBeGreaterThan(0);
    }
  });

  test("org overrides win; unset keys fall back to platform defaults", () => {
    // Built For Her-style overrides, expressed purely as tenant data.
    const overrides = {
      instructor: { singular: "Coach", plural: "Coaches" },
      learner: { singular: "Member", plural: "Members" },
      learning_path: { singular: "Journey", plural: "Journeys" },
      module: { singular: "Phase", plural: "Phases" },
    } as const;

    expect(resolveTerm("instructor", overrides).singular).toBe("Coach");
    expect(resolveTerm("learning_path", overrides).plural).toBe("Journeys");
    // Canonical entity untouched by display rename:
    expect(resolveTerm("course", overrides)).toEqual(
      PLATFORM_TERM_DEFAULTS.course,
    );
  });
});
