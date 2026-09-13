import { expect, test, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * The mutating half of the happy path (CTO review P1-8, second half):
 * author → publish → assign → learn, executed through the real UI against
 * the real database. The read-only suite proves the surfaces compose; this
 * one proves the platform's core promise — content someone writes today is
 * deliverable to a learner minutes later.
 *
 * Allowed to exist since the environment split: the database under test
 * (dev) no longer backs any public deployment, so a mutation here is not a
 * production risk (P0-2 closed 2026-09-08).
 *
 * SELF-CLEANING, same convention as the real-DB suites: every artifact is
 * created under a unique run id and archived/withdrawn in the cleanup hook,
 * so repeated runs cannot silt the tenant up with residue (the exact
 * failure mode the 2026-09 purge removed). The course gets TWO lessons and
 * the learner completes only the first — a completed enrollment would be
 * immutable evidence and could never be withdrawn.
 */

const EMAIL = "alpha.owner@novakore.test";
const LEARNER = "alpha.learner@novakore.test";
const PASSWORD = process.env.NOVAKORE_TEST_PASSWORD;
const ORG = "alpha-learning";

const RUN = Date.now().toString(36);
const TITLE = `E2E authoring probe ${RUN}`;
const SLUG = `e2e-authoring-${RUN}`;

test.skip(
  !PASSWORD,
  "NOVAKORE_TEST_PASSWORD is not set — E2E requires real credentials.",
);

function adminClient(): SupabaseClient {
  return createClient(
    process.env.NOVAKORE_TEST_SUPABASE_URL!,
    process.env.NOVAKORE_TEST_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } },
  );
}

async function signIn(page: Page, email: string) {
  await page.goto("/sign-in");
  await page.getByRole("textbox", { name: /email/i }).fill(email);
  await page.getByRole("textbox", { name: /password/i }).fill(PASSWORD!);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await page.waitForURL(/\/select-org|\/(admin|learn)(\/|$|\?)/, {
    timeout: 30_000,
  });
}

/** Publish the currently open lesson: one text block, then the ceremony. */
async function publishOpenLesson(page: Page, body: string) {
  await page.getByRole("button", { name: /add a block/i }).click();
  const slash = page.getByRole("dialog", { name: /insert block/i });
  await expect(slash).toBeVisible();
  await slash.getByRole("combobox").fill("text");
  await slash.getByRole("combobox").press("Enter");

  const textField = page.getByRole("textbox", { name: /^text content$/i });
  await expect(textField).toBeVisible();
  await textField.fill(body);

  await page.getByRole("button", { name: /^publish lesson$/i }).click();
  const ceremony = page.getByRole("dialog", { name: /publish lesson/i });
  await expect(ceremony).toBeVisible();
  await ceremony.getByRole("button", { name: /^publish v1$/i }).click();
  await expect(page.getByText(/version 1 is live/i)).toBeVisible({
    timeout: 45_000,
  });
}

test.describe.serial("authoring → publish → assign → learn", () => {
  let courseId: string | null = null;

  test.afterAll(async () => {
    // Cleanup runs even when a step failed halfway; every part tolerates
    // the artifact it targets not existing yet. Same authenticated path the
    // real-DB suites use — there is deliberately no service key anywhere.
    const supabase = adminClient();
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: EMAIL,
      password: PASSWORD!,
    });
    if (authError) return; // No session, nothing was created either.

    const { data: course } = await supabase
      .from("courses")
      .select("id")
      .eq("slug", SLUG)
      .maybeSingle();
    if (!course) return;

    const { data: enrollments } = await supabase
      .from("enrollments")
      .select("id, status")
      .eq("course_id", course.id);
    for (const enrollment of enrollments ?? []) {
      if (enrollment.status === "active") {
        await supabase.rpc("set_enrollment_status", {
          p_enrollment_id: enrollment.id,
          p_status: "withdrawn",
        });
      }
    }

    // Archive-over-delete, like every suite in this repo: the course drops
    // out of the catalog, composition metrics, and recent drafts; the
    // immutable published version stays, as designed.
    await supabase
      .from("courses")
      .update({ status: "archived", archived_at: new Date().toISOString() })
      .eq("id", course.id);
  });

  test("an owner authors and publishes a two-lesson course", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await signIn(page, EMAIL);

    // --- Create the draft through the courses surface ---------------------
    await page.goto(`/${ORG}/admin/courses`);
    await page.locator('[data-tour-id="courses-create-button"]').click();
    await page.locator("#course-title").fill(TITLE);
    await page.locator("#course-slug").fill(SLUG);
    await page.locator('[data-tour-id="course-create-submit"]').click();
    // This assertion is the regression trap for known-framework-defects.md:
    // when this spec first ran, the submit hung FOREVER because the action
    // re-rendered a page that awaits `searchParams`. The convention (return
    // plain state, client refreshes) resolves it in seconds; the generous
    // timeout is for slow machines, not for the hang coming back — the hang
    // exceeds any timeout.
    await expect(page.getByText(/course created/i)).toBeVisible({
      timeout: 45_000,
    });

    // The list spans many pages, so resolve the new draft's id rather than
    // hunting for its row; everything it PROVES still happens through UI.
    const supabase = adminClient();
    await supabase.auth.signInWithPassword({
      email: EMAIL,
      password: PASSWORD!,
    });
    const { data: created } = await supabase
      .from("courses")
      .select("id")
      .eq("slug", SLUG)
      .single();
    expect(created?.id).toBeTruthy();
    courseId = created!.id;

    // --- Structure: one module, two lessons --------------------------------
    await page.goto(`/${ORG}/admin/courses/${courseId}`);
    await page.locator("#new-module-title").fill("Module one");
    await page.locator('[data-tour-id="module-create-button"]').click();
    await expect(page.getByRole("heading", { name: "Module one" })).toBeVisible(
      { timeout: 30_000 },
    );

    for (const lesson of ["First lesson", "Second lesson"]) {
      await page.getByPlaceholder(/^new .* title…$/i).fill(lesson);
      await page.locator('[data-tour-id="lesson-create-button"]').click();
      await expect(page.getByRole("link", { name: lesson })).toBeVisible({
        timeout: 30_000,
      });
    }

    // --- Publish both lessons in the Knowledge IDE -------------------------
    for (const lesson of ["First lesson", "Second lesson"]) {
      await page.getByRole("link", { name: lesson }).click();
      await page.waitForURL(/\/lessons\/[0-9a-f-]{36}/, { timeout: 30_000 });
      await publishOpenLesson(page, `Body of ${lesson} for run ${RUN}.`);
      await page.goto(`/${ORG}/admin/courses/${courseId}`);
    }

    // --- Publish the course -------------------------------------------------
    // The panel pins exact lesson versions; the button stays disabled until
    // every lesson has one, so its enablement is itself an assertion.
    const publish = page.locator('[data-tour-id="course-publish-control"]');
    await expect(publish).toBeEnabled({ timeout: 20_000 });
    await publish.click();
    await expect(page.getByText(/published version 1\./i)).toBeVisible({
      timeout: 45_000,
    });
  });

  test("the owner assigns it to the learner", async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page, EMAIL);
    await page.goto(`/${ORG}/admin/enrollments`);

    await page.locator("#enroll-member").selectOption({ label: LEARNER });
    await page.locator("#enroll-target").selectOption({ label: TITLE });
    await page.getByRole("button", { name: /^assign$/i }).click();
    await expect(page.getByText(/enrollment created/i)).toBeVisible({
      timeout: 45_000,
    });
  });

  test("the learner opens it and completes the first lesson", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await signIn(page, LEARNER);

    await page.goto(`/${ORG}/learn`);
    await page.getByRole("link", { name: new RegExp(TITLE) }).click();
    await page.waitForURL(/\/learn\/[0-9a-f-]{36}/, { timeout: 30_000 });

    await page.getByRole("link", { name: "First lesson" }).click();
    await page.waitForURL(/\/lessons\/[0-9a-f-]{36}/, { timeout: 30_000 });
    // The block published minutes ago is what renders — the whole loop.
    await expect(
      page.getByText(`Body of First lesson for run ${RUN}.`),
    ).toBeVisible();

    await page.getByRole("button", { name: /^mark complete$/i }).click();
    await expect(page.getByText(/lesson complete/i)).toBeVisible({
      timeout: 20_000,
    });

    // Back on the course overview, progress reflects the completion and the
    // enrollment is still active (one of two lessons) — which is what lets
    // the cleanup hook withdraw it instead of leaving immutable residue.
    await page.getByRole("link", { name: /back to overview/i }).click();
    await expect(page.getByText(/1 of 2|Done/i).first()).toBeVisible({
      timeout: 20_000,
    });
  });
});
