import { describe, expect, test } from "vitest";
import {
  academySchema,
  contrastRatio,
  inviteMemberSchema,
  slugSchema,
  terminologyEntrySchema,
} from "./validation";

describe("server-action input validation", () => {
  test("invite email is normalized and validated", () => {
    expect(
      inviteMemberSchema.parse({ email: "  Person@Example.COM " }).email,
    ).toBe("person@example.com");
    expect(
      inviteMemberSchema.safeParse({ email: "not-an-email" }).success,
    ).toBe(false);
    expect(inviteMemberSchema.safeParse({ email: "" }).success).toBe(false);
  });

  test("slugs enforce lowercase URL-safe shape", () => {
    expect(slugSchema.safeParse("coaching-academy").success).toBe(true);
    expect(slugSchema.parse("UPPER")).toBe("upper"); // normalized
    expect(slugSchema.safeParse("has space").success).toBe(false);
    expect(slugSchema.safeParse("double--hyphen").success).toBe(false);
    expect(slugSchema.safeParse("-leading").success).toBe(false);
    expect(slugSchema.safeParse("a".repeat(64)).success).toBe(false);
  });

  test("terminology requires canonical keys and bounded values", () => {
    const valid = {
      term_key: "instructor",
      singular: "Coach",
      plural: "Coaches",
      short_form: "",
    };
    expect(terminologyEntrySchema.safeParse(valid).success).toBe(true);
    expect(
      terminologyEntrySchema.safeParse({ ...valid, term_key: "made_up_entity" })
        .success,
    ).toBe(false);
    expect(
      terminologyEntrySchema.safeParse({ ...valid, singular: "" }).success,
    ).toBe(false);
    expect(
      terminologyEntrySchema.safeParse({ ...valid, plural: "x".repeat(41) })
        .success,
    ).toBe(false);
  });

  test("academy input validates name and slug together", () => {
    expect(
      academySchema.safeParse({
        name: "Foundations",
        slug: "foundations",
        description: "",
      }).success,
    ).toBe(true);
    expect(
      academySchema.safeParse({
        name: "F",
        slug: "foundations",
        description: "",
      }).success,
    ).toBe(false);
  });

  test("contrast math is shared from the domain package", () => {
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 0);
    expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 1);
  });
});
