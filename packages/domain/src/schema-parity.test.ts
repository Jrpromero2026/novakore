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

  test("future organizations receive every catalog permission (owner bundle in the LATEST create_system_roles)", () => {
    // The Phase 1C progress.override defect class: a permission backfilled
    // for existing orgs but missing from the seed function. The latest
    // definition of app.create_system_roles must grant the owner role every
    // catalog permission — new orgs can never trail the catalog.
    const files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql"))
      .sort();
    let latestDefinition: string | null = null;
    for (const f of files) {
      const sql = readFileSync(resolve(migrationsDir, f), "utf8");
      const marker = "function app.create_system_roles";
      let index = sql.indexOf(marker);
      while (index !== -1) {
        const end = sql.indexOf("$$;", sql.indexOf("as $$", index));
        latestDefinition = sql.slice(index, end === -1 ? undefined : end);
        index = sql.indexOf(marker, index + 1);
      }
    }
    expect(
      latestDefinition,
      "create_system_roles definition not found",
    ).not.toBeNull();
    const ownerStart = latestDefinition!.indexOf("'organization_owner'");
    const ownerEnd = latestDefinition!.indexOf("'organization_admin'");
    const ownerBlock = latestDefinition!.slice(ownerStart, ownerEnd);
    for (const code of PERMISSIONS) {
      expect(
        ownerBlock,
        `permission ${code} missing from the owner bundle in the LATEST create_system_roles — future organizations would not receive it`,
      ).toContain(`'${code}'`);
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
