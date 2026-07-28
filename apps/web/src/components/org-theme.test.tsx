import { render } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { tenantThemeSchema, NOVAKORE_BASE } from "@novakore/domain";
import { OrgThemeStyle, themeOverrideDeclarations } from "./org-theme";

const theme = tenantThemeSchema.parse({
  schemaVersion: 1,
  colors: { accentLight: "#6d28d9", accentDark: "#a78bfa" },
  shape: { radiusProfile: "soft" },
});

describe("tenant theme application (CSS-injection boundary)", () => {
  test("emits only diffed, validated custom properties for both modes", () => {
    const { container } = render(<OrgThemeStyle theme={theme} />);
    const css = container.querySelector("style")?.textContent ?? "";
    expect(css).toContain("--accent:#6d28d9");
    expect(css).toContain("--accent:#a78bfa");
    expect(css).toContain("--radius-unit:1.35");
    // untouched tokens are not emitted (base cascade remains authoritative)
    expect(css).not.toContain("--background:");
    // protected semantics never appear in tenant emission
    for (const protectedVar of [
      "--danger",
      "--success",
      "--warning",
      "--info",
      "--focus-ring",
    ]) {
      expect(css).not.toContain(`${protectedVar}:`);
    }
  });

  test("null theme emits nothing (platform identity remains intact)", () => {
    const { container } = render(<OrgThemeStyle theme={null} />);
    expect(container.querySelector("style")).toBeNull();
  });

  test("declarations contain only hex values — no injectable strings survive", () => {
    // The schema is the first gate; the emitter re-checks every value.
    const light = themeOverrideDeclarations(theme, "light");
    for (const declaration of light.split(";").filter(Boolean)) {
      expect(declaration).toMatch(/^--[a-z-]+:#[0-9a-f]{6}$/);
    }
    expect(light).not.toContain("url(");
    expect(light).not.toContain("<");
  });

  test("resolver fallback: unset tokens equal the NovaKore base", () => {
    expect(themeOverrideDeclarations(null, "dark")).toBe("");
    const dark = themeOverrideDeclarations(theme, "dark");
    expect(dark).not.toContain(NOVAKORE_BASE.dark.background.slice(1));
  });
});
