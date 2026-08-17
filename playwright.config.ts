import { readFileSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end configuration (CTO review P1-8 — the platform's biggest
 * quality blind spot: six phases of UI shipped with no automated browser
 * coverage).
 *
 * Deliberate constraints:
 *  - ONE worker, no parallelism. The suite authenticates against the shared
 *    dev database, which rate-limits auth; parallel sign-ins produce false
 *    failures (a documented flake mode in the operations runbook).
 *  - READ-ONLY journey. These tests never publish, never mutate tenant data.
 *    Until the environment split lands, the database under test is the one
 *    the deployment serves — an E2E suite that writes to it would be the
 *    very risk the review flagged (P0-2).
 */

// Local runs read the gitignored env file; CI injects real secrets.
function fromEnvFile(key: string): string | undefined {
  try {
    const match = readFileSync(".env.test.local", "utf8").match(
      new RegExp(`^${key}=(.*)$`, "m"),
    );
    return match?.[1]?.trim();
  } catch {
    return undefined;
  }
}

for (const key of [
  "NOVAKORE_TEST_SUPABASE_URL",
  "NOVAKORE_TEST_SUPABASE_ANON_KEY",
  "NOVAKORE_TEST_PASSWORD",
]) {
  process.env[key] ??= fromEnvFile(key);
}

// The app reads NEXT_PUBLIC_* — mirror the test project into them so the
// server under test talks to the same database the assertions assume.
process.env.NEXT_PUBLIC_SUPABASE_URL ??= process.env.NOVAKORE_TEST_SUPABASE_URL;
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??=
  process.env.NOVAKORE_TEST_SUPABASE_ANON_KEY;

const baseURL = process.env.NOVAKORE_E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Production server: this is what the deployment actually runs.
    command: "npm run start",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
      NEXT_PUBLIC_SUPABASE_ANON_KEY:
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    },
  },
});
