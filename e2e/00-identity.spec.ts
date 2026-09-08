import { expect, test } from "@playwright/test";

/**
 * Second half of the identity preflight (see global-setup.ts): globalSetup
 * runs BEFORE Playwright's webServer probe, so an app still booting on the
 * port can slip past it and be "reused" as the system under test. This file
 * sorts first (workers=1, filename order), so the wrong server produces one
 * pointed failure at the top of the run instead of a wall of timeouts.
 */
test("the server under test is novakore-web", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.ok(), "health endpoint must answer").toBe(true);
  const body = (await response.json()) as { service?: string };
  expect(
    body.service,
    "a different app is holding this port — stop it, or set NOVAKORE_E2E_BASE_URL",
  ).toBe("novakore-web");
});
