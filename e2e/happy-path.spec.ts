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

  test("a multi-page collection actually pages, and page 2 differs", async ({
    page,
  }) => {
    // alpha-learning carries enough courses to span pages; bfh-dev does not,
    // so this is the tenant that can prove paging rather than assume it.
    await page.goto("/sign-in");
    await page
      .getByRole("textbox", { name: /email/i })
      .fill("alpha.owner@novakore.test");
    await page.getByRole("textbox", { name: /password/i }).fill(PASSWORD!);
    await page.getByRole("button", { name: /^sign in$/i }).click();
    // Must reach a signed-in destination. A looser pattern silently matches
    // the "//localhost:3000/" inside the URL's authority, returns instantly,
    // and lets the next navigation race the session — which then bounces to
    // /sign-in and makes this test skip while looking like it passed.
    await page.waitForURL(/\/select-org|\/admin/, { timeout: 30_000 });

    await page.goto("/alpha-learning/admin/courses");
    await assertNoErrorPage(page);
    expect(page.url(), "expected a signed-in session, not /sign-in").toContain(
      "/admin/courses",
    );

    // The page streams: goto() resolves on the static shell, and the
    // collection arrives after. Waiting for a real row first is what makes
    // the pager check meaningful — an immediate query would inspect the
    // shell and conclude, wrongly, that there is nothing to page.
    await expect(
      page.locator('a[href*="/admin/courses/"]').first(),
    ).toBeVisible({ timeout: 20_000 });

    // No skip branch: this tenant is seeded with far more courses than one
    // page holds, so an absent pager is a regression, not a tenant that
    // happens to be small. A conditional skip here would hide exactly the
    // failure this test exists to catch.
    const pager = page.getByRole("navigation", { name: /pagination/i });
    await expect(pager).toBeVisible({ timeout: 20_000 });
    await expect(pager).toContainText(/of \d+/);

    // Capture page 1, then follow the real link to page 2.
    const firstPageRows = await page
      .locator('a[href*="/admin/courses/"]')
      .allInnerTexts();

    await pager.getByRole("link", { name: /next/i }).click();
    await page.waitForURL(/[?&]page=2/, { timeout: 20_000 });
    await assertNoErrorPage(page);

    const secondPageRows = await page
      .locator('a[href*="/admin/courses/"]')
      .allInnerTexts();
    expect(secondPageRows.length).toBeGreaterThan(0);
    // The whole point: a different slice, not the same rows again.
    expect(secondPageRows).not.toEqual(firstPageRows);
  });

  test("every navigable destination in the shell actually resolves", async ({
    page,
  }) => {
    // This test exists because of a real defect: the six-domain shell shipped
    // with three domain links pointing at routes that did not exist, and the
    // journey test above did not catch it because it only clicks ONE domain.
    // A navigation model is a promise that every link leads somewhere; the
    // only honest way to keep that promise is to walk all of them.
    test.setTimeout(180_000);

    await signIn(page);
    await page.goto(`/${ORG}/admin`);
    await assertNoErrorPage(page);

    const domainNav = page
      .getByRole("navigation", { name: /workspace domains/i })
      .first();
    await expect(domainNav).toBeVisible();

    const domainHrefs = await domainNav
      .getByRole("link")
      .evaluateAll((els) =>
        els.map((el) => (el as HTMLAnchorElement).getAttribute("href") ?? ""),
      );
    expect(domainHrefs.length).toBe(6);

    // Breadth first: every domain, then every card on every domain landing.
    // Collected as a set so shared destinations are visited once.
    const visited = new Set<string>();
    const broken: string[] = [];

    for (const href of domainHrefs) {
      if (!href || visited.has(href)) continue;
      visited.add(href);

      const response = await page.goto(href);
      const status = response?.status() ?? 0;
      if (status >= 400) {
        broken.push(`${href} -> ${status}`);
        continue;
      }
      // A route that quietly bounces to sign-in is broken too, just less
      // visibly: it means the page exists but rejects a session that the
      // navigation just told the user was welcome there.
      if (/\/sign-in/.test(page.url())) {
        broken.push(`${href} -> bounced to sign-in`);
        continue;
      }
      await assertNoErrorPage(page);

      // Every card on this landing is a navigation object; follow them all.
      const cardHrefs = await page
        .locator(`main a[href^="/${ORG}/admin/"]`)
        .evaluateAll((els) =>
          els.map((el) => (el as HTMLAnchorElement).getAttribute("href") ?? ""),
        );

      for (const card of cardHrefs) {
        if (!card || visited.has(card)) continue;
        visited.add(card);
        const cardResponse = await page.goto(card);
        const cardStatus = cardResponse?.status() ?? 0;
        if (cardStatus >= 400) broken.push(`${card} -> ${cardStatus}`);
        else if (/\/sign-in/.test(page.url()))
          broken.push(`${card} -> bounced to sign-in`);
      }
    }

    // Report every broken link at once. Failing on the first would turn a
    // single run into one bug report per fix cycle.
    expect(broken, `broken navigation targets:\n${broken.join("\n")}`).toEqual(
      [],
    );
    // Guard against the assertion passing vacuously. An owner of a seeded
    // tenant reaches roughly 27 destinations; a floor of 20 fails loudly if
    // the card selector stops matching and "no broken links" starts meaning
    // "no links were checked" — which is how this class of bug hides.
    expect(
      visited.size,
      `walked only ${visited.size} destinations: ${[...visited].join(", ")}`,
    ).toBeGreaterThan(20);
  });

  test("on a phone, a walkthrough anchors somewhere the user can see", async ({
    page,
  }) => {
    // The six-domain navigation is a horizontal scroll row on mobile, not a
    // drawer. That removed the need for the tour's old "open the nav drawer"
    // event, but only if scrollIntoView really scrolls the ROW and not just
    // the page — Workspace sits off the right edge at 375px until it does.
    // Asserted rather than assumed, because the coachmark would otherwise
    // point confidently at something outside the viewport.
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 375, height: 812 });
    await signIn(page);
    await page.goto(`/${ORG}/admin`);
    await assertNoErrorPage(page);

    const show = page.getByRole("button", { name: /show me/i }).first();
    await expect(show).toBeVisible({ timeout: 20_000 });
    await show.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    // Never the missing-target recovery panel: that is what a tour pointing
    // at the deleted sidebar used to render.
    await expect(dialog).not.toContainText(/can't find|cannot find/i);

    // Polled, not slept: the scroll is smooth, so the first measurement is
    // mid-animation and a fixed wait would encode a guess about its duration.
    const anchored = page
      .locator('[data-tour-id="nav-domain-workspace"]')
      .locator("visible=true")
      .first();
    await expect(anchored).toBeVisible();
    await expect
      .poll(
        async () => {
          const box = await anchored.boundingBox();
          if (!box) return null;
          // How far the element spills outside the viewport, either side.
          return Math.max(0, -box.x, box.x + box.width - 375);
        },
        {
          message: "tour anchor never scrolled fully into the mobile viewport",
          timeout: 15_000,
        },
      )
      .toBeLessThanOrEqual(2);
  });

  test("a keyboard user can skip the global navigation", async ({ page }) => {
    // The sidebar used to come after the page in tab order. The global
    // navigation comes before it, so without a skip link every keyboard or
    // switch user traverses six domain links, the palette, help, theme and
    // the account menu before reaching the content — on every navigation.
    await signIn(page);
    await page.goto(`/${ORG}/admin/courses`);
    await assertNoErrorPage(page);

    await page.keyboard.press("Tab");
    const focused = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      const box = el?.getBoundingClientRect();
      return {
        text: el?.textContent?.trim() ?? "",
        // sr-only until focused: a skip link nobody can see is not one.
        visible: !!box && box.width > 1 && box.height > 1,
      };
    });
    expect(focused.text).toMatch(/skip to content/i);
    expect(focused.visible, "the skip link must appear when focused").toBe(
      true,
    );

    // And it must actually move focus, not just the scroll position.
    await page.keyboard.press("Enter");
    await expect
      .poll(() => page.evaluate(() => document.activeElement?.id ?? ""))
      .toBe("main");
  });

  test("no page pushes a horizontal scrollbar on a phone", async ({ page }) => {
    // Sideways scroll on a phone is the failure mode a desktop-built redesign
    // ships without noticing. It found a real one on its first run: a
    // screen-reader-only <table> carrying the text equivalent of a sparkline.
    // sr-only pins width to 1px, but under automatic table layout a width is
    // only a minimum, so the table stayed 353px wide and pushed every page
    // with a sparkline sideways.
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 375, height: 812 });
    await signIn(page);

    const offenders: string[] = [];
    for (const path of [
      "",
      "/workspace",
      "/knowledge",
      "/learning",
      "/people",
      "/intelligence",
      "/intelligence/insights",
      "/courses",
      "/members",
      "/studio",
    ]) {
      await page.goto(`/${ORG}/admin${path}`);
      await assertNoErrorPage(page);
      const width = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        client: document.documentElement.clientWidth,
      }));
      // One pixel of slack: sub-pixel layout rounding is not a defect.
      if (width.scroll > width.client + 1) {
        offenders.push(`${path || "/"} (${width.scroll} > ${width.client})`);
      }
    }

    expect(
      offenders,
      `pages scrolling sideways at 375px:\n${offenders.join("\n")}`,
    ).toEqual([]);
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
    // The six-domain shell. Asserting the DOMAIN LIST rather than merely
    // that some navigation exists: the whole claim of the redesign is that a
    // user meets six words instead of twenty destinations, so that is the
    // thing worth failing on.
    const domainNav = page
      .getByRole("navigation", { name: /workspace domains/i })
      .first();
    await expect(domainNav).toBeVisible();
    await expect(domainNav.getByRole("link")).toHaveText([
      "Home",
      "Knowledge",
      "Learning",
      "People",
      "Intelligence",
      "Workspace",
    ]);

    // Progressive disclosure, exercised rather than asserted: click into a
    // domain and confirm it lands on its own level with a working trail.
    await domainNav.getByRole("link", { name: "Workspace" }).click();
    await page.waitForURL(/\/admin\/workspace/, { timeout: 20_000 });
    await assertNoErrorPage(page);
    await expect(
      page.getByRole("heading", { level: 1, name: "Workspace" }),
    ).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: /breadcrumb/i }),
    ).toBeVisible();

    // And the cards are navigation objects, not decoration.
    await page
      .getByRole("link", { name: /branding/i })
      .first()
      .click();
    await page.waitForURL(/\/admin\/branding/, { timeout: 20_000 });
    await assertNoErrorPage(page);

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

    // A detail page is where orientation matters most — it is the furthest
    // from the domain landing and the only place the trail carries names the
    // shell cannot derive. These pages hand-wrote their own trails until the
    // migration, and one of them climbed to Studio, which is not where a
    // lesson lives.
    await expect(
      page.getByRole("navigation", { name: /breadcrumb/i }).first(),
    ).toBeVisible();

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
