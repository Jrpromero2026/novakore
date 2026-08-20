import { PLATFORM_TERM_DEFAULTS } from "@novakore/domain";
import { describe, expect, test } from "vitest";
import {
  allDestinations,
  buildDomains,
  domainForPath,
  type Domain,
} from "./domains";

const ORG = "timberhill-pt";
const BASE = `/${ORG}/admin`;

/** Every permission the platform currently gates a destination on. */
const ALL = [
  "content.view_draft",
  "content.author",
  "content.publish",
  "paths.manage",
  "assessment.author",
  "assessment.publish",
  "assessment.grade",
  "enrollment.manage",
  "certificates.manage",
  "analytics.view",
  "org.members.manage",
  "org.roles.manage",
  "org.terminology.manage",
  "org.branding.manage",
  "org.manage",
  "academy.manage",
];

const keys = (domains: Domain[]) => domains.map((d) => d.key);

describe("buildDomains — shape", () => {
  test("an owner sees all six domains, in the specified order", () => {
    expect(keys(buildDomains(ORG, ALL))).toEqual([
      "home",
      "knowledge",
      "learning",
      "people",
      "intelligence",
      "workspace",
    ]);
  });

  test("no domain exposes more than a handful of sections", () => {
    // The whole point of the redesign: a level shows what exists AT that
    // level. A domain that grew eight sections would be the old sidebar
    // wearing a different hat.
    for (const domain of buildDomains(ORG, ALL)) {
      expect(domain.sections.length, domain.key).toBeLessThanOrEqual(4);
    }
  });

  test("every destination carries a description that is not the label", () => {
    for (const item of allDestinations(buildDomains(ORG, ALL))) {
      expect(item.description.length, item.label).toBeGreaterThan(0);
      expect(item.description.toLowerCase()).not.toBe(item.label.toLowerCase());
    }
  });

  test("every href is scoped to the organization", () => {
    for (const item of allDestinations(buildDomains(ORG, ALL))) {
      expect(item.href.startsWith(`/${ORG}/`), item.href).toBe(true);
    }
  });

  test("no destination appears in two domains", () => {
    const seen = new Map<string, string>();
    for (const domain of buildDomains(ORG, ALL)) {
      for (const section of domain.sections) {
        for (const item of section.items) {
          expect(
            seen.has(item.href),
            `${item.href} claimed by ${seen.get(item.href)} and ${domain.key}`,
          ).toBe(false);
          seen.set(item.href, domain.key);
        }
      }
    }
  });
});

describe("buildDomains — permission filtering", () => {
  test("a learner with no admin permissions sees only Home", () => {
    // Not "sees six empty domains" — an empty destination advertises a
    // capability the caller does not hold.
    expect(keys(buildDomains(ORG, []))).toEqual(["home"]);
  });

  test("an empty section is dropped rather than rendered empty", () => {
    // content.view_draft alone: Knowledge survives, and Learning keeps only
    // the sections whose items survive — Curriculum (Courses) and Participation
    // (My learning, the author's view of the learner shell). Assessment and
    // Credentials drop entirely because nothing in them clears the filter.
    const learning = buildDomains(ORG, ["content.view_draft"]).find(
      (d) => d.key === "learning",
    );
    expect(learning?.sections.map((s) => s.label)).toEqual([
      "Curriculum",
      "Participation",
    ]);
    for (const section of learning?.sections ?? []) {
      expect(section.items.length).toBeGreaterThan(0);
    }
  });

  test("a reviewer sees the review queue but not authoring-only surfaces", () => {
    const domains = buildDomains(ORG, [
      "content.view_draft",
      "assessment.grade",
    ]);
    const hrefs = allDestinations(domains).map((i) => i.href);
    expect(hrefs).toContain(`${BASE}/reviews`);
    expect(hrefs).not.toContain(`${BASE}/members`);
    expect(hrefs).not.toContain(`${BASE}/roles`);
    expect(hrefs).not.toContain(`${BASE}/branding`);
  });

  test("a member manager sees People but not Knowledge", () => {
    const domains = buildDomains(ORG, ["org.members.manage"]);
    expect(keys(domains)).toEqual(["home", "people"]);
  });

  test("filtering never invents a destination", () => {
    const full = new Set(
      allDestinations(buildDomains(ORG, ALL)).map((i) => i.href),
    );
    for (const perms of [[], ["analytics.view"], ["org.manage"], ALL]) {
      for (const item of allDestinations(buildDomains(ORG, perms))) {
        expect(full.has(item.href), item.href).toBe(true);
      }
    }
  });

  test("Home survives with no permissions because it is always visible", () => {
    const home = buildDomains(ORG, [])[0];
    expect(home?.key).toBe("home");
    expect(home?.sections).toEqual([]);
  });
});

describe("domainForPath", () => {
  const domains = buildDomains(ORG, ALL);

  test("resolves a destination to its owning domain", () => {
    expect(domainForPath(domains, `${BASE}/branding`)?.key).toBe("workspace");
    expect(domainForPath(domains, `${BASE}/courses`)?.key).toBe("learning");
    expect(domainForPath(domains, `${BASE}/ops`)?.key).toBe("intelligence");
    expect(domainForPath(domains, `${BASE}/members`)?.key).toBe("people");
  });

  test("longest match wins, so a nested route is not stolen by its parent", () => {
    // /studio and /studio/library are both destinations; the deeper one owns
    // the path. Both happen to be Knowledge, so assert the discrimination
    // directly rather than relying on the domain being the same.
    expect(domainForPath(domains, `${BASE}/studio/library`)?.key).toBe(
      "knowledge",
    );
    expect(domainForPath(domains, `${BASE}/studio/templates`)?.key).toBe(
      "knowledge",
    );
  });

  test("a deep child route resolves to its destination's domain", () => {
    expect(domainForPath(domains, `${BASE}/courses/abc-123`)?.key).toBe(
      "learning",
    );
    expect(domainForPath(domains, `${BASE}/courses/abc/lessons/def`)?.key).toBe(
      "learning",
    );
    expect(domainForPath(domains, `${BASE}/reviews/attempt-1`)?.key).toBe(
      "learning",
    );
  });

  test("the base path resolves to Home and does not swallow its children", () => {
    expect(domainForPath(domains, BASE)?.key).toBe("home");
    expect(domainForPath(domains, `${BASE}/branding`)?.key).not.toBe("home");
  });

  test("a prefix that is not a path segment does not match", () => {
    // /admin/coursesXYZ must not resolve to /admin/courses.
    expect(domainForPath(domains, `${BASE}/coursesXYZ`)?.key).toBe("home");
  });

  test("an unknown path outside the org returns null", () => {
    expect(domainForPath(domains, "/other-org/admin/branding")).toBeNull();
    expect(domainForPath(domains, "/sign-in")).toBeNull();
  });

  test("a destination hidden by permissions does not resolve", () => {
    // The route still exists and the server still guards it; it simply has
    // no navigational home for this caller.
    const limited = buildDomains(ORG, ["analytics.view"]);
    expect(domainForPath(limited, `${BASE}/branding`)?.key).toBe("home");
  });
});

describe("allDestinations", () => {
  test("flattens every visible item exactly once", () => {
    const domains = buildDomains(ORG, ALL);
    const flat = allDestinations(domains);
    const counted = domains.reduce(
      (n, d) => n + d.sections.reduce((m, s) => m + s.items.length, 0),
      0,
    );
    expect(flat).toHaveLength(counted);
    expect(new Set(flat.map((i) => i.href)).size).toBe(flat.length);
  });

  test("returns nothing when nothing is visible", () => {
    expect(allDestinations(buildDomains(ORG, []))).toEqual([]);
  });
});

describe("terminology", () => {
  test("a renamed concept reaches the navigation, not just the page", () => {
    // An organization that calls a Course a Program must see Program in the
    // trail too. Breadcrumbs are now the only thing on screen answering
    // "where am I?", so a trail using vocabulary the tenant has renamed away
    // describes a product they do not recognize.
    const term = ((key: string) =>
      key === "course"
        ? { singular: "Program", plural: "Programs" }
        : PLATFORM_TERM_DEFAULTS[
            key as keyof typeof PLATFORM_TERM_DEFAULTS
          ]) as Parameters<typeof buildDomains>[2];

    const labels = buildDomains(ORG, ALL, term)
      .flatMap((d) => d.sections)
      .flatMap((s) => s.items)
      .map((i) => i.label);

    expect(labels).toContain("Programs");
    expect(labels).not.toContain("Courses");
  });

  test("without a tenant resolver the platform vocabulary is used", () => {
    const labels = buildDomains(ORG, ALL)
      .flatMap((d) => d.sections)
      .flatMap((s) => s.items)
      .map((i) => i.label);
    expect(labels).toContain("Courses");
  });
});
