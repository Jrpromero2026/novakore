import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
  CONTRAST_AA_NON_TEXT,
  CONTRAST_AA_TEXT,
  KNOWN_CONTRAST_EXCEPTIONS,
  PALETTE,
  SEMANTIC_COLORS,
  contrastRatio,
} from "./colors";
import { LOGO_ASSETS } from "./logo";
import { TYPE_ROLES } from "./typography";

const WEB_ROOT = join(__dirname, "..", "..", "..", "apps", "web");

describe("WCAG AA contrast", () => {
  for (const mode of ["light", "dark"] as const) {
    const c = SEMANTIC_COLORS[mode];
    if (!c) throw new Error("missing mode");

    test(`${mode}: primary text on every background/surface`, () => {
      for (const bg of [
        c.background,
        c.backgroundElevated,
        c.backgroundSubtle,
        c.surface,
        c.surfaceElevated,
        c.surfaceInteractive,
      ]) {
        expect(contrastRatio(c.textPrimary!, bg!)).toBeGreaterThanOrEqual(
          CONTRAST_AA_TEXT,
        );
      }
    });

    test(`${mode}: secondary text on base backgrounds`, () => {
      expect(
        contrastRatio(c.textSecondary!, c.background!),
      ).toBeGreaterThanOrEqual(CONTRAST_AA_TEXT);
      expect(
        contrastRatio(c.textSecondary!, c.surface!),
      ).toBeGreaterThanOrEqual(CONTRAST_AA_TEXT);
    });

    test(`${mode}: accent button label meets AA`, () => {
      expect(
        contrastRatio(c.accentContrast!, c.accent!),
      ).toBeGreaterThanOrEqual(CONTRAST_AA_TEXT);
    });

    test(`${mode}: accent and focus ring meet non-text contrast vs background`, () => {
      expect(contrastRatio(c.accent!, c.background!)).toBeGreaterThanOrEqual(
        CONTRAST_AA_NON_TEXT,
      );
      expect(contrastRatio(c.focusRing!, c.background!)).toBeGreaterThanOrEqual(
        CONTRAST_AA_NON_TEXT,
      );
    });

    test(`${mode}: status colors meet AA text contrast or are listed exceptions`, () => {
      for (const token of ["success", "warning", "danger", "info"] as const) {
        const ratio = contrastRatio(c[token]!, c.background!);
        const exception = KNOWN_CONTRAST_EXCEPTIONS.find(
          (e) => e.mode === mode && e.token === token,
        );
        if (exception) {
          // Documented pre-v1.0 gap: must never regress below its floor.
          expect(ratio).toBeGreaterThanOrEqual(exception.floor);
        } else {
          expect(ratio).toBeGreaterThanOrEqual(CONTRAST_AA_TEXT);
        }
      }
    });
  }
});

describe("CSS projection parity (globals.css)", () => {
  const css = readFileSync(join(WEB_ROOT, "src", "app", "globals.css"), "utf8");

  /** Extract `--kebab: #hex` declarations from a CSS block. */
  function tokensIn(block: string): Record<string, string> {
    const out: Record<string, string> = {};
    for (const m of block.matchAll(/--([a-z-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) {
      out[m[1]!] = m[2]!.toUpperCase();
    }
    return out;
  }

  const kebab = (name: string) =>
    name.replace(/[A-Z]/g, (ch) => `-${ch.toLowerCase()}`);

  const lightBlock = css.slice(css.indexOf(":root {"), css.indexOf("@media"));
  const darkBlock = css.slice(
    css.indexOf("@media (prefers-color-scheme: dark)"),
    css.indexOf('[data-theme="light"]'),
  );

  const cases: Array<["light" | "dark", string]> = [
    ["light", lightBlock],
    ["dark", darkBlock],
  ];

  for (const [mode, block] of cases) {
    test(`${mode} semantic hex tokens match the package`, () => {
      const cssTokens = tokensIn(block);
      for (const [name, value] of Object.entries(SEMANTIC_COLORS[mode])) {
        const cssName = kebab(name);
        // Tokens expressed via color-mix() in CSS have no hex to compare.
        if (!(cssName in cssTokens)) continue;
        expect(`${cssName}: ${cssTokens[cssName]}`).toBe(
          `${cssName}: ${value.toUpperCase()}`,
        );
      }
      // The comparison set must be substantive, not vacuous.
      expect(Object.keys(tokensIn(block)).length).toBeGreaterThanOrEqual(15);
    });
  }

  test("brand gradient primitives are declared in CSS", () => {
    for (const hex of [
      PALETTE.novaPurple,
      PALETTE.electricIndigo,
      PALETTE.coreBlue,
    ]) {
      expect(css.toUpperCase()).toContain(hex.toUpperCase());
    }
  });
});

describe("logo asset registry", () => {
  test("every registered asset exists on disk", () => {
    for (const [name, publicPath] of Object.entries(LOGO_ASSETS)) {
      const file = join(WEB_ROOT, "public", ...publicPath.split("/"));
      expect(existsSync(file), `${name} → ${publicPath}`).toBe(true);
    }
  });

  test("SVG sources are self-contained (no external references)", () => {
    for (const publicPath of Object.values(LOGO_ASSETS)) {
      if (!publicPath.endsWith(".svg")) continue;
      const svg = readFileSync(
        join(WEB_ROOT, "public", ...publicPath.split("/")),
        "utf8",
      );
      expect(svg).not.toMatch(
        /<script|on[a-z]+=|javascript:|@import|https?:\/\/(?!www\.w3\.org)/,
      );
    }
  });
});

describe("typography roles", () => {
  test("all roles define size, line height, and weight", () => {
    for (const role of Object.values(TYPE_ROLES)) {
      expect(role.size).toMatch(/rem$/);
      expect(role.lineHeight).toBeGreaterThan(1);
      expect(role.weight).toBeGreaterThanOrEqual(400);
    }
  });
});
