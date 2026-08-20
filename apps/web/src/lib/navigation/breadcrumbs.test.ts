import { PLATFORM_TERM_DEFAULTS } from "@novakore/domain";
import { describe, expect, test } from "vitest";
import { buildBreadcrumbs } from "./breadcrumbs";
import { buildDomains } from "./domains";

const ORG = "timberhill-pt";
const BASE = `/${ORG}/admin`;
const ALL = [
  "content.view_draft",
  "paths.manage",
  "assessment.author",
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

const domains = buildDomains(ORG, ALL);
const trail = (path: string, extra?: { label: string; href?: string }[]) =>
  buildBreadcrumbs(domains, path, extra).map((c) =>
    c.href ? `${c.label}→${c.href}` : c.label,
  );

describe("buildBreadcrumbs", () => {
  test("a destination reads Domain / Section / Page", () => {
    expect(trail(`${BASE}/branding`)).toEqual([
      `Workspace→${BASE}/workspace`,
      "Identity",
      "Branding",
    ]);
  });

  test("the section is orientation, never a link", () => {
    // Sections group cards; they have no route. A clickable crumb that goes
    // nowhere is worse than plain text.
    const crumbs = buildBreadcrumbs(domains, `${BASE}/branding`);
    expect(crumbs[1]).toEqual({ label: "Identity" });
    expect(crumbs[1]?.href).toBeUndefined();
  });

  test("the last crumb is never a link", () => {
    for (const path of [
      `${BASE}/branding`,
      `${BASE}/courses`,
      `${BASE}/workspace`,
      `${BASE}/ops`,
    ]) {
      const crumbs = buildBreadcrumbs(domains, path);
      expect(crumbs[crumbs.length - 1]?.href, path).toBeUndefined();
    }
  });

  test("a domain landing page is a single, non-linked crumb", () => {
    expect(trail(`${BASE}/workspace`)).toEqual(["Workspace"]);
    expect(trail(`${BASE}/people`)).toEqual(["People"]);
  });

  test("a page can append its own deeper crumbs", () => {
    // The shell cannot know a course title; only the page can.
    expect(
      trail(`${BASE}/courses/abc-123`, [{ label: "Safety Procedures" }]),
    ).toEqual([
      `Learning→${BASE}/learning`,
      "Curriculum",
      `Courses→${BASE}/courses`,
      "Safety Procedures",
    ]);
  });

  test("an appended trail makes the parent destination clickable", () => {
    // On /courses the Courses crumb is "you are here"; one level deeper it
    // becomes the way back.
    expect(trail(`${BASE}/courses`)).toEqual([
      `Learning→${BASE}/learning`,
      "Curriculum",
      "Courses",
    ]);
    const deeper = trail(`${BASE}/courses/abc`, [{ label: "A course" }]);
    expect(deeper).toContain(`Courses→${BASE}/courses`);
  });

  test("multiple appended crumbs preserve order, last one unlinked", () => {
    expect(
      trail(`${BASE}/courses/abc/lessons/def`, [
        { label: "Safety Procedures", href: `${BASE}/courses/abc` },
        { label: "SAF-01" },
      ]),
    ).toEqual([
      `Learning→${BASE}/learning`,
      "Curriculum",
      `Courses→${BASE}/courses`,
      `Safety Procedures→${BASE}/courses/abc`,
      "SAF-01",
    ]);
  });

  test("an appended crumb carrying an href is still unlinked when last", () => {
    const crumbs = buildBreadcrumbs(domains, `${BASE}/courses/abc`, [
      { label: "A course", href: "/somewhere" },
    ]);
    expect(crumbs[crumbs.length - 1]).toEqual({ label: "A course" });
  });

  test("depth stays shallow — never more than three before the page adds any", () => {
    for (const domain of domains) {
      for (const section of domain.sections) {
        for (const item of section.items) {
          expect(
            buildBreadcrumbs(domains, item.href).length,
            item.href,
          ).toBeLessThanOrEqual(3);
        }
      }
    }
  });

  test("every linked crumb points at a real destination in the model", () => {
    const known = new Set<string>();
    for (const d of domains) {
      known.add(d.href);
      for (const s of d.sections) for (const i of s.items) known.add(i.href);
    }
    for (const d of domains) {
      for (const s of d.sections) {
        for (const i of s.items) {
          for (const crumb of buildBreadcrumbs(domains, i.href)) {
            if (crumb.href)
              expect(known.has(crumb.href), crumb.href).toBe(true);
          }
        }
      }
    }
  });

  test("an unknown path yields no spine, only what the page supplies", () => {
    expect(trail("/sign-in")).toEqual([]);
    expect(trail("/sign-in", [{ label: "Sign in" }])).toEqual(["Sign in"]);
  });

  test("a destination the caller cannot see produces no section crumb", () => {
    // The route still exists and the server still guards it; it simply has no
    // navigational home for this caller, so we do not invent one.
    const limited = buildDomains(ORG, ["analytics.view"]);
    const crumbs = buildBreadcrumbs(limited, `${BASE}/branding`);
    expect(crumbs.map((c) => c.label)).not.toContain("Identity");
  });

  test("Home resolves without claiming a section", () => {
    expect(trail(BASE)).toEqual(["Home"]);
  });
});

describe("adjacent duplicates", () => {
  test("a tenant rename that collides with a section shows one crumb", () => {
    // The organization renamed Course to Program; the section is Curriculum,
    // so nothing collides. Rename it to Curriculum instead and the trail must
    // not read "Curriculum > Curriculum".
    const term = ((key: string) =>
      key === "course"
        ? { singular: "Curriculum", plural: "Curriculum" }
        : PLATFORM_TERM_DEFAULTS[
            key as keyof typeof PLATFORM_TERM_DEFAULTS
          ]) as Parameters<typeof buildDomains>[2];

    const domains = buildDomains(ORG, ["content.view_draft"], term);
    const labels = buildBreadcrumbs(domains, `${BASE}/courses`).map(
      (c) => c.label,
    );

    expect(labels.filter((l) => l === "Curriculum")).toHaveLength(1);
    // The trail still climbs: domain first, destination last.
    expect(labels[0]).toBe("Learning");
    expect(labels[labels.length - 1]).toBe("Curriculum");
  });
});
