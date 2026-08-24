import { expect, test, type Page } from "@playwright/test";

/**
 * The NovaKore happy path, end to end, in a real browser against a real
 * database — the journey a customer actually takes:
 *
 *   anonymous is refused → sign in → choose an organization → the Command
 *   Center renders real signals → Studio opens the Builder hierarchy → a
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

const EMAIL = "alpha.owner@novakore.test";
const PASSWORD = process.env.NOVAKORE_TEST_PASSWORD;
// The synthetic tenant, deliberately — NOT Built For Her.
//
// The suite used to sign in as seven @novakore.test accounts inside what is
// now a real customer's organization, which meant fabricated staff in their
// member list and test traffic in their audit trail. Alpha exists to be used
// this way: 226 published courses (enough to prove pagination rather than
// assume it), a seeded academy, and a full spread of roles.
const ORG = "alpha-learning";
// Seeded QA credential in the synthetic tenant. The assertion tolerates
// either outcome (found / not found) so a cold reset cannot make this flake —
// what matters is that the anonymous route renders instead of erroring.
const CREDENTIAL_CODE = "NVK-7378-0256-F472-2AD3";

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
    // This tenant carries enough courses to span pages, which is why the
    // whole suite now runs here. It used to sign in separately because it
    // needed a different organization from everything else.
    await signIn(page);

    await page.goto(`/${ORG}/admin/courses`);
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

  test("people land where their permissions actually lead", async ({
    page,
  }) => {
    // Everyone used to be sent to /admin, so a learner signing in met the
    // administration workspace: one navigation item, an empty dashboard, and
    // nothing indicating their courses were elsewhere.
    //
    // The observer case is the one that makes this a capability rule rather
    // than a seniority rule — they hold only analytics.view, which opens a
    // real destination, so the workspace is right for them.
    test.setTimeout(180_000);

    const expectations = [
      ["alpha.learner@novakore.test", "/learn", "learner"],
      // A narrow permission set is still a reason to be in the workspace.
      // The sharpest version of that — an observer holding ONLY
      // analytics.view — has no account in this tenant, and is covered
      // exactly in landing.test.ts where the permissions can be stated
      // directly rather than depended on as a fixture.
      ["alpha.reviewer@novakore.test", "/admin", "reviewer"],
      ["alpha.owner@novakore.test", "/admin", "owner"],
    ] as const;

    for (const [email, expected, label] of expectations) {
      await page.context().clearCookies();
      await page.goto("/sign-in");
      await page.getByRole("textbox", { name: /email/i }).fill(email);
      await page.getByRole("textbox", { name: /password/i }).fill(PASSWORD!);
      await page.getByRole("button", { name: /^sign in$/i }).click();
      // Two legitimate shapes, and the test has to accept both. A member of
      // ONE organization is forwarded straight in. A member of several — like
      // the owner, who also owns the isolation-test tenant — stops at the
      // picker and chooses, which is correct rather than a failure.
      await page.waitForURL(/\/select-org|\/(admin|learn)(\/|$|\?)/, {
        timeout: 30_000,
      });
      await assertNoErrorPage(page);

      if (new URL(page.url()).pathname === "/select-org") {
        // The picker's link is the routing decision, made per organization.
        const href = await page
          .locator(`a[href^="/${ORG}/"]`)
          .first()
          .getAttribute("href");
        expect(href, `${label}'s entry for ${ORG}`).toContain(expected);
        await page.goto(href!);
      } else {
        expect(
          new URL(page.url()).pathname,
          `${label} should land on ${expected}`,
        ).toContain(expected);
      }

      // And a stale bookmark to the workspace index resolves the same way.
      // Polled: the redirect is issued by the server component after the
      // navigation resolves, so reading the URL once can catch it mid-flight.
      await page.goto(`/${ORG}/admin`);
      await expect
        .poll(() => new URL(page.url()).pathname, {
          message: `${label} visiting /admin directly`,
          // Generous because the redirect's DESTINATION is what is slow: the
          // Academy takes ~130ms per enrollment to render, and this fixture
          // holds 111 of them. The redirect itself is prompt.
          timeout: 45_000,
        })
        .toContain(expected);

      // A deep admin link resolves by whether this person has ANY admin
      // surface. A learner has none, so /admin/members is not a page they
      // were refused — it is a wing of the building they have no business
      // in, and sending them home beats explaining each locked door.
      if (expected === "/learn") {
        await page.goto(`/${ORG}/admin/members`);
        await expect
          .poll(() => new URL(page.url()).pathname, {
            message: `${label} opening a deep admin link`,
            timeout: 45_000,
          })
          .toContain("/learn");
      }
    }
  });

  test("partial access is explained, not redirected away", async ({ page }) => {
    // The counterpart to the rule above. An author holds real permissions,
    // so a page they happen to lack is a refusal that deserves saying so —
    // exactly the case that would be lost if the redirect applied to
    // everyone who cannot open a particular page.
    await page.goto("/sign-in");
    await page
      .getByRole("textbox", { name: /email/i })
      .fill("alpha.author@novakore.test");
    await page.getByRole("textbox", { name: /password/i }).fill(PASSWORD!);
    await page.getByRole("button", { name: /^sign in$/i }).click();
    await page.waitForURL(/\/select-org|\/(admin|learn)(\/|$|\?)/, {
      timeout: 30_000,
    });

    await page.goto(`/${ORG}/admin/members`);
    await expect
      .poll(() => new URL(page.url()).pathname, { timeout: 30_000 })
      .toContain("/admin/denied");
  });

  test("the Academy does not slow down with more enrollments", async ({
    page,
  }) => {
    // This page loaded in 640ms for a learner with one enrollment and 14.5
    // SECONDS for one with 113, because it looked up each enrollment's title
    // and progress inside a loop. The fixture below is the heavy case.
    //
    // The budget is deliberately loose. It is not a performance target — it
    // is far enough below the old behaviour to catch the query-per-row
    // pattern coming back, and far enough above the current ~1s to survive a
    // slow machine without crying wolf.
    test.setTimeout(120_000);

    // The heavy fixture specifically — the shared signIn helper is the owner,
    // who has barely any enrollments and would pass this trivially.
    await page.goto("/sign-in");
    await page
      .getByRole("textbox", { name: /email/i })
      .fill("alpha.learner@novakore.test");
    await page.getByRole("textbox", { name: /password/i }).fill(PASSWORD!);
    await page.getByRole("button", { name: /^sign in$/i }).click();
    await page.waitForURL(/\/select-org|\/(admin|learn)(\/|$|\?)/, {
      timeout: 30_000,
    });

    await page.goto(`/${ORG}/learn`); // warm the route
    const started = Date.now();
    await page.goto(`/${ORG}/learn`);
    const elapsed = Date.now() - started;

    await assertNoErrorPage(page);

    // Every enrollment still resolves a real title. The loop version fell
    // back to the literal "Enrollment" whenever a lookup missed, so its
    // absence is the correctness half of this check.
    const links = await page.locator('a[href*="/learn/"]').count();
    expect(links, "the learner's enrollments render").toBeGreaterThan(20);
    await expect(page.getByText(/^Enrollment$/)).toHaveCount(0);

    expect(
      elapsed,
      `Academy took ${elapsed}ms for ${links} enrollments — the per-row query pattern is back`,
    ).toBeLessThan(6_000);
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

  for (const scheme of ["light", "dark"] as const) {
    test(`shell text meets AA contrast in ${scheme} mode`, async ({ page }) => {
      // This found a live defect on its first run, and not a subtle one: in
      // dark mode the tenant's branded LIGHT background stayed in force while
      // the text tokens correctly flipped, leaving near-white text on cream
      // at about 1:1. Reading the CSS would not have shown it — the cascade
      // only misbehaves once a real tenant theme is layered onto it.
      test.setTimeout(120_000);
      await page.emulateMedia({ colorScheme: scheme });
      await signIn(page);
      await page.goto(`/${ORG}/admin/courses`);
      await assertNoErrorPage(page);

      const failures = await page.evaluate(() => {
        const parse = (c: string) => {
          const m = c.match(/[\d.]+/g)!.map(Number);
          return { r: m[0]!, g: m[1]!, b: m[2]!, a: m[3] ?? 1 };
        };
        const luminance = (c: { r: number; g: number; b: number }) => {
          const f = (v: number) => {
            v /= 255;
            return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
          };
          return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
        };
        // Walk up for the first opaque ancestor: the painted background.
        const backgroundOf = (el: Element) => {
          let node: Element | null = el;
          while (node) {
            const c = parse(getComputedStyle(node).backgroundColor);
            if (c.a > 0.9) return c;
            node = node.parentElement;
          }
          return { r: 255, g: 255, b: 255 };
        };
        const ratioOf = (el: Element) => {
          const [hi, lo] = [
            luminance(parse(getComputedStyle(el).color)),
            luminance(backgroundOf(el)),
          ].sort((a, b) => b - a);
          return (hi! + 0.05) / (lo! + 0.05);
        };

        const targets: [string, string][] = [
          ['nav[aria-label="Breadcrumb"] a', "breadcrumb link"],
          [
            'nav[aria-label="Breadcrumb"] [aria-current="page"]',
            "breadcrumb current",
          ],
          [
            'nav[aria-label="Workspace domains"] a[aria-current="page"]',
            "active domain",
          ],
          [
            'nav[aria-label="Workspace domains"] a:not([aria-current])',
            "inactive domain",
          ],
          ["main h1", "page title"],
        ];

        const bad: string[] = [];
        for (const [selector, name] of targets) {
          const el = document.querySelector(selector);
          if (!el) continue; // Absent on some routes; other specs cover presence.
          const style = getComputedStyle(el);
          const px = parseFloat(style.fontSize);
          const large =
            px >= 24 || (parseInt(style.fontWeight, 10) >= 700 && px >= 18.66);
          const required = large ? 3 : 4.5;
          const ratio = ratioOf(el);
          if (ratio < required) {
            bad.push(
              `${name}: ${ratio.toFixed(2)}:1 (needs ${required}:1 at ${px}px)`,
            );
          }
        }
        return bad;
      });

      expect(
        failures,
        `contrast failures in ${scheme} mode:\n${failures.join("\n")}`,
      ).toEqual([]);
    });
  }

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

    // --- Studio: the Builder hierarchy -----------------------------------
    await page.goto(`/${ORG}/admin/studio`);
    await assertNoErrorPage(page);
    await expect(page.getByText(/^Builder$/).first()).toBeVisible();

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
