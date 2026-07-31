import { describe, expect, test } from "vitest";
import { buildNavSections } from "./nav-config";

describe("buildNavSections", () => {
  test("permissionless members see only ungated destinations", () => {
    const sections = buildNavSections("acme", []);
    const hrefs = sections.flatMap((s) => s.items).map((i) => i.href);
    expect(hrefs).toContain("/acme/admin");
    expect(hrefs).toContain("/acme/learn");
    expect(hrefs).toContain("/acme/admin/academies");
    expect(hrefs).not.toContain("/acme/admin/ops");
    expect(hrefs).not.toContain("/acme/admin/members");
    // Organization settings are gated on org.manage.
    expect(hrefs).not.toContain("/acme/admin/settings");
    // Fully gated sections prune away entirely.
    expect(sections.map((s) => s.label)).not.toContain("Learning");
  });

  test("org.manage reveals the dedicated settings surface", () => {
    const hrefs = buildNavSections("acme", ["org.manage"])
      .flatMap((s) => s.items)
      .map((i) => i.href);
    expect(hrefs).toContain("/acme/admin/settings");
  });

  test("granted permissions reveal their sections", () => {
    const sections = buildNavSections("acme", [
      "content.view_draft",
      "assessment.grade",
      "analytics.view",
    ]);
    const hrefs = sections.flatMap((s) => s.items).map((i) => i.href);
    expect(hrefs).toContain("/acme/admin/studio");
    expect(hrefs).toContain("/acme/admin/studio/ai");
    expect(hrefs).toContain("/acme/admin/reviews");
    expect(hrefs).toContain("/acme/admin/ops");
    expect(hrefs).not.toContain("/acme/admin/roles");
  });

  test("every item carries an icon and a unique href", () => {
    const sections = buildNavSections("acme", [
      "content.view_draft",
      "paths.manage",
      "assessment.author",
      "assessment.grade",
      "enrollment.manage",
      "certificates.manage",
      "org.members.manage",
      "org.roles.manage",
      "org.terminology.manage",
      "org.branding.manage",
      "org.manage",
      "analytics.view",
    ]);
    const items = sections.flatMap((s) => s.items);
    const hrefs = items.map((i) => i.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    for (const item of items) {
      expect(item.icon.length).toBeGreaterThan(0);
      expect(item.href.startsWith("/acme/")).toBe(true);
    }
  });
});
