import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { PERMISSIONS, SYSTEM_ROLE_KEYS } from "./permissions";
import { TERM_KEYS } from "./terminology";

/**
 * Architecture parity tests: the TypeScript domain catalog and the SQL
 * migrations must describe the same platform. These read the committed
 * migration files (the schema's source of truth) and fail on drift.
 */

const migrationsDir = resolve(
  import.meta.dirname,
  "../../../supabase/migrations",
);
const migrationSql = readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .map((f) => readFileSync(resolve(migrationsDir, f), "utf8"))
  .join("\n");

describe("domain ↔ migration parity", () => {
  test("every domain permission code is seeded in the permissions catalog migration", () => {
    for (const code of PERMISSIONS) {
      expect(
        migrationSql,
        `permission ${code} missing from migrations`,
      ).toContain(`'${code}'`);
    }
  });

  test("every canonical term key appears in the terminology check constraint", () => {
    for (const key of TERM_KEYS) {
      expect(migrationSql, `term key ${key} missing from migrations`).toContain(
        `'${key}'`,
      );
    }
  });

  test("every system role key is created by the provisioning function", () => {
    for (const key of SYSTEM_ROLE_KEYS) {
      expect(
        migrationSql,
        `system role ${key} missing from migrations`,
      ).toContain(`'${key}'`);
    }
  });

  test("no tenant vocabulary leaks into canonical identifiers", () => {
    // Display terms must never become schema/domain identifiers (ADR-003).
    for (const display of [
      "journey",
      "program",
      "coach",
      "member_role_journey",
    ]) {
      expect(PERMISSIONS.some((p) => p.includes(display))).toBe(false);
      expect(TERM_KEYS.some((k) => k === display)).toBe(false);
    }
  });
});
