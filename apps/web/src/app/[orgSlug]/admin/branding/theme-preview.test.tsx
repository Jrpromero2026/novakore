import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { NOVAKORE_BASE, tenantThemeSchema } from "@novakore/domain";
import { ThemePreview } from "./theme-preview";

const theme = tenantThemeSchema.parse({
  schemaVersion: 1,
  colors: { accentLight: "#be185d", accentDark: "#f472b6" },
});

describe("theme preview (shared resolver, not a mockup)", () => {
  test("renders both modes with resolver-computed accents", () => {
    const { container } = render(<ThemePreview theme={theme} />);
    const light = container.querySelector(
      '[data-preview-mode="light"]',
    ) as HTMLElement;
    const dark = container.querySelector(
      '[data-preview-mode="dark"]',
    ) as HTMLElement;
    expect(light.style.getPropertyValue("--accent")).toBe("#be185d");
    expect(dark.style.getPropertyValue("--accent")).toBe("#f472b6");
    // protected semantics come from the platform base in every tenant theme
    expect(light.style.getPropertyValue("--danger")).toBe(
      NOVAKORE_BASE.light.danger,
    );
    expect(dark.style.getPropertyValue("--danger")).toBe(
      NOVAKORE_BASE.dark.danger,
    );
  });

  test("null theme previews the NovaKore platform defaults (fallback path)", () => {
    const { container } = render(<ThemePreview theme={null} />);
    const light = container.querySelector(
      '[data-preview-mode="light"]',
    ) as HTMLElement;
    expect(light.style.getPropertyValue("--accent")).toBe(
      NOVAKORE_BASE.light.accent,
    );
  });

  test("status states are labeled by words, not color alone", () => {
    render(<ThemePreview theme={theme} />);
    expect(screen.getAllByText(/error: required field missing/i)).toHaveLength(
      2,
    );
    expect(screen.getAllByText(/warning: unpublished changes/i)).toHaveLength(
      2,
    );
  });
});
