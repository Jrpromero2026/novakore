import { describe, expect, test } from "vitest";
import {
  CONTRAST_BLOCKING_MIN,
  NOVAKORE_BASE,
  contrastRatio,
  evaluateThemeContrast,
  resolveThemeTokens,
  tenantThemeSchema,
  themeFromLegacyBranding,
  themeHasBlockingContrast,
  type TenantThemeInput,
} from "./theme";

const validInput: TenantThemeInput = {
  schemaVersion: 1,
  colors: { accentLight: "#BE185D", accentDark: "#F472B6" },
};

describe("tenant theme schema (strict, versioned)", () => {
  test("accepts a bounded valid theme and normalizes hex casing", () => {
    const parsed = tenantThemeSchema.parse(validInput);
    expect(parsed.colors.accentLight).toBe("#be185d");
    expect(parsed.typography.interfaceFont).toBe("geist"); // defaulted
    expect(parsed.shape.radiusProfile).toBe("balanced");
    expect(parsed.modes.availability).toBe("both");
  });

  test("rejects unknown keys everywhere (no smuggled customization)", () => {
    expect(
      tenantThemeSchema.safeParse({ ...validInput, customCss: ".x{}" }).success,
    ).toBe(false);
    expect(
      tenantThemeSchema.safeParse({
        schemaVersion: 1,
        colors: { ...validInput.colors, dangerLight: "#ff0000" },
      }).success,
    ).toBe(false);
    expect(
      tenantThemeSchema.safeParse({
        schemaVersion: 1,
        colors: { ...validInput.colors, focusRing: "#00ff00" },
      }).success,
    ).toBe(false);
  });

  test("rejects invalid colors and injection attempts", () => {
    for (const bad of [
      "red",
      "#fff",
      "#12345g",
      "#fff};body{color:red}",
      "url(x)",
    ]) {
      expect(
        tenantThemeSchema.safeParse({
          schemaVersion: 1,
          colors: { accentLight: bad, accentDark: "#111111" },
        }).success,
      ).toBe(false);
    }
  });

  test("enforces the font catalog and radius profiles", () => {
    expect(
      tenantThemeSchema.safeParse({
        ...validInput,
        typography: { interfaceFont: "comic-sans" },
      }).success,
    ).toBe(false);
    expect(
      tenantThemeSchema.safeParse({
        ...validInput,
        typography: { interfaceFont: "https://evil.example/font.css" },
      }).success,
    ).toBe(false);
    expect(
      tenantThemeSchema.safeParse({
        ...validInput,
        shape: { radiusProfile: "23px" },
      }).success,
    ).toBe(false);
  });

  test("rejects wrong schema versions", () => {
    expect(
      tenantThemeSchema.safeParse({ ...validInput, schemaVersion: 2 }).success,
    ).toBe(false);
  });
});

describe("theme resolver (single code path for app + preview)", () => {
  test("null theme resolves to NovaKore base in both modes", () => {
    expect(resolveThemeTokens(null, "light")).toEqual(NOVAKORE_BASE.light);
    expect(resolveThemeTokens(null, "dark")).toEqual(NOVAKORE_BASE.dark);
  });

  test("tenant accent overrides apply per mode with derived states", () => {
    const theme = tenantThemeSchema.parse(validInput);
    const light = resolveThemeTokens(theme, "light");
    const dark = resolveThemeTokens(theme, "dark");
    expect(light.accent).toBe("#be185d");
    expect(dark.accent).toBe("#f472b6");
    expect(light.accentHover).not.toBe(light.accent);
    expect(light.background).toBe(NOVAKORE_BASE.light.background); // untouched keys fall back
  });

  test("protected semantics are never tenant-influenced", () => {
    const theme = tenantThemeSchema.parse({
      schemaVersion: 1,
      colors: {
        accentLight: "#000000",
        accentDark: "#ffffff",
        backgroundLight: "#111111",
        backgroundDark: "#eeeeee",
        textPrimaryLight: "#222222",
        textPrimaryDark: "#dddddd",
      },
    });
    for (const mode of ["light", "dark"] as const) {
      const t = resolveThemeTokens(theme, mode);
      expect(t.success).toBe(NOVAKORE_BASE[mode].success);
      expect(t.warning).toBe(NOVAKORE_BASE[mode].warning);
      expect(t.danger).toBe(NOVAKORE_BASE[mode].danger);
      expect(t.info).toBe(NOVAKORE_BASE[mode].info);
      expect(t.focusRing).toBe(NOVAKORE_BASE[mode].focusRing);
    }
  });

  test("accent contrast text is computed for readable buttons", () => {
    const paleAccent = tenantThemeSchema.parse({
      schemaVersion: 1,
      colors: { accentLight: "#f4f4f5", accentDark: "#f4f4f5" },
    });
    const t = resolveThemeTokens(paleAccent, "light");
    expect(t.accentContrast).toBe("#101114"); // white text would be unreadable
    expect(contrastRatio(t.accent, t.accentContrast)).toBeGreaterThan(
      CONTRAST_BLOCKING_MIN,
    );
  });
});

describe("contrast policy (measured thresholds)", () => {
  test("the NovaKore base theme has no blocking issues", () => {
    expect(themeHasBlockingContrast(null)).toBe(false);
  });

  test("unreadable text-on-background blocks publication", () => {
    const bad = tenantThemeSchema.parse({
      schemaVersion: 1,
      colors: {
        accentLight: "#5a5cff",
        accentDark: "#5a5cff",
        backgroundLight: "#eeeeee",
        textPrimaryLight: "#dddddd",
      },
    });
    const issues = evaluateThemeContrast(bad);
    expect(
      issues.some((i) => i.level === "blocking" && i.mode === "light"),
    ).toBe(true);
    expect(themeHasBlockingContrast(bad)).toBe(true);
    // every issue reports a measured ratio, not an assertion
    for (const issue of issues) {
      expect(issue.ratio).toBeGreaterThan(0);
      expect(issue.required).toBeGreaterThan(0);
    }
  });
});

describe("legacy branding conversion (Phase 1A columns)", () => {
  test("maps legacy columns into a valid versioned theme", () => {
    const theme = themeFromLegacyBranding({
      accent_light: "#6d28d9",
      accent_dark: "#a78bfa",
      font_family: "system",
      radius_scale: "large",
    });
    expect(theme.colors.accentLight).toBe("#6d28d9");
    expect(theme.typography.interfaceFont).toBe("system");
    expect(theme.shape.radiusProfile).toBe("soft");
  });
});
