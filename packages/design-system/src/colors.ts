/**
 * NovaKore color system.
 *
 * Named primitives → semantic tokens, per mode. The CSS projection in
 * apps/web/src/app/globals.css must match these values exactly
 * (guarded by tokens.test.ts). Components never hardcode hex — they consume
 * semantic tokens only.
 */

/** Named platform palette (Brand Framework §4 + Brand Integration v1.0). */
export const PALETTE = {
  /** Primary brand triad — the logo gradient. */
  novaPurple: "#8A3FFC",
  electricIndigo: "#5A5CFF",
  coreBlue: "#2FB3FF",

  /** Accent interaction states. */
  indigoHover: "#494BE8",
  indigoActive: "#3F41D1",
  indigoSoft: "#ECECFF",

  /** Supporting neutrals. */
  midnightBlack: "#0B0B0D", // "Obsidian"
  carbon: "#17181C",
  graphite: "#24262B",
  ink: "#101114",
  white: "#FFFFFF",
  softGray: "#F7F8FA", // "Cloud"
  slate: "#7C8498",
  steel: "#BFC6D5",
} as const;

export type PaletteName = keyof typeof PALETTE;

/**
 * The brand gradient: six expanding arms sweep purple → indigo → blue.
 * Decorative use is restricted — see docs/brand/colors.md.
 */
export const BRAND_GRADIENT = {
  stops: [PALETTE.novaPurple, PALETTE.electricIndigo, PALETTE.coreBlue],
  /** CSS value for the standard 135° sweep. */
  css: `linear-gradient(135deg, ${PALETTE.novaPurple} 0%, ${PALETTE.electricIndigo} 50%, ${PALETTE.coreBlue} 100%)`,
} as const;

export type ThemeMode = "light" | "dark";

/** Semantic tokens per mode — mirror of the globals.css custom properties. */
export const SEMANTIC_COLORS: Record<ThemeMode, Record<string, string>> = {
  light: {
    background: "#F7F8FA",
    backgroundElevated: "#FFFFFF",
    backgroundSubtle: "#EFF1F5",
    surface: "#FFFFFF",
    surfaceElevated: "#FFFFFF",
    surfaceInteractive: "#EFF1F5",
    textPrimary: "#101114",
    textSecondary: "#4A5164",
    textMuted: "#7C8498",
    textInverse: "#FFFFFF",
    borderDefault: "#E3E6EC",
    borderStrong: "#BFC6D5",
    borderSubtle: "#EDEFF4",
    accent: "#5A5CFF",
    accentHover: "#494BE8",
    accentActive: "#3F41D1",
    accentContrast: "#FFFFFF",
    focusRing: "#494BE8",
    selection: "#ECECFF",
    success: "#18A957",
    warning: "#D99614",
    danger: "#D63B3B",
    info: "#3B82F6",
  },
  dark: {
    background: "#0B0B0D",
    backgroundElevated: "#17181C",
    backgroundSubtle: "#101114",
    surface: "#17181C",
    surfaceElevated: "#1C1E23",
    surfaceInteractive: "#20232A",
    textPrimary: "#F2F3F7",
    textSecondary: "#7C8498",
    textMuted: "#565D6E",
    textInverse: "#101114",
    borderDefault: "#24262B",
    borderStrong: "#33363E",
    borderSubtle: "#1C1E23",
    accent: "#5A5CFF",
    accentHover: "#6D6FFF",
    accentActive: "#494BE8",
    accentContrast: "#FFFFFF",
    focusRing: "#7B7DFF",
    selection: "#5A5CFF",
    success: "#2FC272",
    warning: "#E8AB3A",
    danger: "#E25858",
    info: "#5B9BF8",
  },
};

/** WCAG relative luminance of a #rrggbb hex color. */
export function relativeLuminance(hex: string): number {
  const value = hex.replace("#", "");
  const channel = (i: number) => {
    const c = parseInt(value.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}

/** WCAG contrast ratio between two #rrggbb hex colors (1–21). */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort(
    (x, y) => y - x,
  ) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** WCAG 2.1 AA thresholds. */
export const CONTRAST_AA_TEXT = 4.5;
export const CONTRAST_AA_LARGE_TEXT = 3.0;
export const CONTRAST_AA_NON_TEXT = 3.0;

/**
 * Known, deliberate contrast exceptions — measured floors, not aspirations.
 *
 * Status colors predate Brand Integration v1.0 and are protected semantics
 * (tenants cannot override them; changing them re-skins existing status UI,
 * which is outside a branding phase). When rendered as *small text on light
 * backgrounds* they fall below AA. Ratios below are the measured floor each
 * pair must never regress beneath; raising them to ≥ 4.5 is the top
 * recommendation for Brand Framework v2.0 (see docs/brand/colors.md).
 */
export const KNOWN_CONTRAST_EXCEPTIONS: ReadonlyArray<{
  mode: ThemeMode;
  token: "success" | "warning" | "danger" | "info";
  against: "background";
  floor: number;
}> = [
  { mode: "light", token: "success", against: "background", floor: 2.8 },
  { mode: "light", token: "warning", against: "background", floor: 2.3 },
  { mode: "light", token: "danger", against: "background", floor: 4.2 },
  { mode: "light", token: "info", against: "background", floor: 3.4 },
];
