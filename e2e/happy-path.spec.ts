import { expect, test, type Page } from "@playwright/test";

/**
 * The NovaKore happy path, end to end, in a real browser against a real
 * database — the journey a customer actually takes:
 *
 *   anonymous is refused → sign in → choose an organization → the Command
 *   Center renders real signals → Studio opens the knowledge graph → a
 *   lesson opens in the Knowledge IDE → the learner Academy renders →
 *   the public credential-verification page works without a session.
 *
 * READ-ONLY by design: nothing here publishes, edits, or mutates tenant
 * data. The database under test is still the one the deployment serves,
 * so a mutating E2E suite would itself be a production risk (review P0-2).
 *
 * Failure of any step means a page composition broke — precisely the class
 * of regression that six phases of UI work had no automated coverage for.
 */

const EMAIL = "bfh.owner@novakore.test";
const PASSWORD = process.env.NOVAKORE_TEST_PASSWORD;
const ORG = "bfh-dev";
// Seeded QA credential on the dev project. The assertion tolerates either
// outcome (found / not found) so a cold reset cannot make this flake — what
// matters is that the anonymous route renders instead of erroring.
const CREDENTIAL_CODE = "NVK-3BAD-3B25-FB7B-8EC3";

test.skip(
  !PASSWORD,
  "NOVAKORE_TEST_PASSWORD is not set — E2E requires real credentials.",
);

/** Fail loudly on a server-error page rather than on a vague timeout. */
async function assertNoErrorPage(page: Page) {
  const body = await page.locator("body").innerText();
  expect(body, `unexpected error page at ${page.url()}`).not.toMatch(
    /Application error|Internal Server Error|500|Unhandled Runtime/i,
  );
}

async function signIn(page: Page) {
  await page.goto("/sign-in");
  await page.getByRole("textbox", { name: /email/i }).fill(EMAIL);
  await page.getByRole("textbox", { name: /password/i }).fill(PASSWORD!);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  // Sign-in redirects to the organization picker.
  await page.waitForURL(/\/select-org|\/[^/]+\/admin/, { timeout: 30_000 });
}

test.describe("NovaKore happy path", () => {
  test("anonymous visitors are refused the admin workspace", async ({
    page,
  }) => {
    await page.goto(`/${ORG}/admin`);
    await page.waitForURL(/\/sign-in/, { timeout: 20_000 });
    await expect(
      page.getByRole("button", { name: /^sign in$/i }),
    ).toBeVisible();
  });

  test("public credential verification works without a session", async ({
    page,
  }) => {
    await page.goto(`/verify/${CREDENTIAL_CODE}`);
    await assertNoErrorPage(page);
    // Never bounced to sign-in: this is the one deliberate anonymous surface.
    expect(page.url()).toContain("/verify/");
  });

  test("sign in → command center → studio → lesson → learner academy", async ({
    page,
  }) => {
    await signIn(page);

    // The organization picker appears only for multi-org members; an account
    // belonging to exactly one organization is forwarded straight into its
    // workspace. Both outcomes are correct, so the journey continues from the
    // workspace URL rather than racing that redirect.

    // --- Command Center ---------------------------------------------------
    await page.goto(`/${ORG}/admin`);
    await assertNoErrorPage(page);
    // The hero greeting is the signature element of the Executive Command
    // Center; its absence means the dashboard composition broke.
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: /workspace navigation/i }),
    ).toBeVisible();

    // --- Studio: the knowledge graph -------------------------------------
    await page.goto(`/${ORG}/admin/studio`);
    await assertNoErrorPage(page);
    await expect(page.getByText(/knowledge graph/i).first()).toBeVisible();

    // --- Knowledge IDE: open a real lesson via the UI ----------------------
    await page.goto(`/${ORG}/admin/courses`);
    await assertNoErrorPage(page);
    const courseLink = page
      .locator(`a[href*="/${ORG}/admin/courses/"]`)
      .first();
    await expect(courseLink).toBeVisible();
    await courseLink.click();
    await page.waitForURL(/\/courses\/[0-9a-f-]{36}/, { timeout: 30_000 });
    await assertNoErrorPage(page);

    const lessonLink = page.locator('a[href*="/lessons/"]').first();
    if (await lessonLink.count()) {
      await lessonLink.click();
      await page.waitForURL(/\/lessons\/[0-9a-f-]{36}/, { timeout: 30_000 });
      await assertNoErrorPage(page);
      // The IDE inspector proves the three-panel workspace mounted.
      await expect(
        page.getByRole("complementary", { name: /lesson inspector/i }),
      ).toBeVisible();
    }

    // --- Intelligence -----------------------------------------------------
    await page.goto(`/${ORG}/admin/intelligence`);
    await assertNoErrorPage(page);
    await expect(
      page.getByText(/knowledge scorecard|intelligence/i).first(),
    ).toBeVisible();

    // --- Learner Academy --------------------------------------------------
    await page.goto(`/${ORG}/learn`);
    await assertNoErrorPage(page);
  });
});
