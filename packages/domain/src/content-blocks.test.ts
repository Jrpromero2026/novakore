import { describe, expect, test } from "vitest";
import {
  contentBlockSchema,
  migrateBlockData,
  validateBlockData,
  CURRENT_SCHEMA_VERSION,
} from "./content-blocks";

const uuid = "018f6d2e-7c4a-7000-8000-000000000001";

describe("content-block schema registry (ADR-008)", () => {
  test("accepts a valid block through the discriminated union", () => {
    const result = contentBlockSchema.safeParse({
      id: uuid,
      position: "a0",
      type: "heading",
      schemaVersion: 1,
      data: { text: "Welcome", level: 2 },
    });
    expect(result.success).toBe(true);
  });

  test("rejects unknown block types — no unvalidated JSON enters", () => {
    const result = contentBlockSchema.safeParse({
      id: uuid,
      position: "a0",
      type: "totally_new_thing",
      schemaVersion: 1,
      data: { anything: true },
    });
    expect(result.success).toBe(false);
  });

  test("rejects data that does not match the type's schema", () => {
    expect(validateBlockData("heading", 1, { text: "", level: 5 }).ok).toBe(
      false,
    );
    expect(validateBlockData("heading", 99, { text: "x", level: 2 }).ok).toBe(
      false,
    );
  });

  test("accessibility contract: image requires alt unless decorative", () => {
    expect(
      validateBlockData("image", 1, { assetId: uuid, decorative: false }).ok,
    ).toBe(false);
    expect(
      validateBlockData("image", 1, { assetId: uuid, alt: "A squat rack" }).ok,
    ).toBe(true);
    expect(
      validateBlockData("image", 1, { assetId: uuid, decorative: true }).ok,
    ).toBe(true);
  });

  test("additive schema evolution: callout v1 data migrates to current v2", () => {
    const v1 = { tone: "warning", body: "Check your form." };
    expect(validateBlockData("callout", 1, v1).ok).toBe(true);

    const migrated = migrateBlockData("callout", 1, v1);
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION.callout);
    expect(
      validateBlockData("callout", migrated.schemaVersion, migrated.data).ok,
    ).toBe(true);
  });

  test("migration refuses gaps instead of guessing", () => {
    expect(() =>
      migrateBlockData("heading", 0, { text: "x", level: 2 }),
    ).toThrow(/missing migration/);
  });
});
