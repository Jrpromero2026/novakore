import { z } from "zod";

/**
 * NovaKore theme system (Phase 1B).
 *
 * - `tenantThemeSchema`: the bounded, versioned, STRICT allow-list of what an
 *   organization may customize. Unknown keys are rejected; protected
 *   semantics (success/warning/danger/info/focus) have no representation
 *   here and therefore cannot be overridden by construction.
 * - `resolveThemeTokens`: the single resolver used by the live application
 *   AND the brand-studio preview. Precedence: NovaKore base → tenant
 *   overrides → (mode chosen by user preference) → derived state tokens.
 * - Contrast policy: measured WCAG 2.2 relative-luminance ratios with
 *   explicit blocking vs warning thresholds.
 */

export const THEME_SCHEMA_VERSION = 1 as const;

export const FONT_CATALOG = ["geist", "inter", "system"] as const;
export type FontChoice = (typeof FONT_CATALOG)[number];

export const RADIUS_PROFILES = ["square", "balanced", "soft"] as const;
export type RadiusProfile = (typeof RADIUS_PROFILES)[number];

export const MODE_AVAILABILITY = ["both", "light", "dark"] as const;
export const DEFAULT_MODES = ["system", "light", "dark"] as const;

const hexColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, { error: "must be a 6-digit hex color" })
  .transform((s) => s.toLowerCase());

/** Bounded tenant customization. STRICT: unknown keys are schema violations. */
export const tenantThemeSchema = z.strictObject({
  schemaVersion: z.literal(THEME_SCHEMA_VERSION),
  colors: z.strictObject({
    accentLight: hexColor,
    accentDark: hexColor,
    secondaryLight: hexColor.optional(),
    secondaryDark: hexColor.optional(),
    backgroundLight: hexColor.optional(),
    backgroundDark: hexColor.optional(),
    surfaceLight: hexColor.optional(),
    surfaceDark: hexColor.optional(),
    textPrimaryLight: hexColor.optional(),
    textPrimaryDark: hexColor.optional(),
  }),
  typography: z
    .strictObject({ interfaceFont: z.enum(FONT_CATALOG) })
    .default({ interfaceFont: "geist" }),
  shape: z
    .strictObject({ radiusProfile: z.enum(RADIUS_PROFILES) })
    .default({ radiusProfile: "balanced" }),
  modes: z
    .strictObject({
      availability: z.enum(MODE_AVAILABILITY),
      defaultMode: z.enum(DEFAULT_MODES),
    })
    .default({ availability: "both", defaultMode: "system" }),
});

export type TenantTheme = z.infer<typeof tenantThemeSchema>;
export type TenantThemeInput = z.input<typeof tenantThemeSchema>;

export type ThemeMode = "light" | "dark";

/** Customizable token names the resolver produces per mode. */
export interface ThemeTokens {
  background: string;
  backgroundElevated: string;
  backgroundSubtle: string;
  surface: string;
  surfaceElevated: string;
  surfaceInteractive: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textInverse: string;
  borderDefault: string;
  borderStrong: string;
  borderSubtle: string;
  accent: string;
  accentHover: string;
  accentActive: string;
  accentContrast: string;
  secondary: string | null;
  /** Protected — never tenant-influenced. */
  focusRing: string;
  success: string;
  warning: string;
  danger: string;
  info: string;
}

/** NovaKore platform base tokens (brand framework §4, design-tokens §2). */
export const NOVAKORE_BASE: Record<ThemeMode, ThemeTokens> = {
  dark: {
    background: "#0b0b0d",
    backgroundElevated: "#17181c",
    backgroundSubtle: "#101114",
    surface: "#17181c",
    surfaceElevated: "#1c1e23",
    surfaceInteractive: "#20232a",
    textPrimary: "#f2f3f7",
    textSecondary: "#7c8498",
    textMuted: "#565d6e",
    textInverse: "#101114",
    borderDefault: "#24262b",
    borderStrong: "#33363e",
    borderSubtle: "#1c1e23",
    accent: "#5a5cff",
    accentHover: "#6d6fff",
    accentActive: "#494be8",
    accentContrast: "#ffffff",
    secondary: null,
    focusRing: "#7b7dff",
    success: "#2fc272",
    warning: "#e8ab3a",
    danger: "#e25858",
    info: "#5b9bf8",
  },
  light: {
    background: "#f7f8fa",
    backgroundElevated: "#ffffff",
    backgroundSubtle: "#eff1f5",
    surface: "#ffffff",
    surfaceElevated: "#ffffff",
    surfaceInteractive: "#eff1f5",
    textPrimary: "#101114",
    textSecondary: "#4a5164",
    textMuted: "#7c8498",
    textInverse: "#ffffff",
    borderDefault: "#e3e6ec",
    borderStrong: "#bfc6d5",
    borderSubtle: "#edeff4",
    accent: "#5a5cff",
    accentHover: "#494be8",
    accentActive: "#3f41d1",
    accentContrast: "#ffffff",
    secondary: null,
    focusRing: "#494be8",
    success: "#18a957",
    warning: "#d99614",
    danger: "#d63b3b",
    info: "#3b82f6",
  },
};

// ---------------------------------------------------------------------------
// Color math
// ---------------------------------------------------------------------------

function clamp255(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function parseHex(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((c) => clamp255(c).toString(16).padStart(2, "0")).join("")}`;
}

/** amount ∈ [-1, 1]: negative darkens toward black, positive lightens toward white. */
export function shiftColor(hex: string, amount: number): string {
  const [r, g, b] = parseHex(hex);
  const target = amount >= 0 ? 255 : 0;
  const t = Math.abs(amount);
  return toHex(
    r + (target - r) * t,
    g + (target - g) * t,
    b + (target - b) * t,
  );
}

/** WCAG 2.2 relative-luminance contrast ratio between two hex colors. */
export function contrastRatio(hexA: string, hexB: string): number {
  const lum = (hex: string) => {
    const channels = parseHex(hex).map((c) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return (
      0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!
    );
  };
  const [l1, l2] = [lum(hexA), lum(hexB)].sort((a, b) => b - a);
  return (l1! + 0.05) / (l2! + 0.05);
}

/** Best readable text color (white vs near-black) for a given background. */
export function bestContrastText(background: string): string {
  return contrastRatio(background, "#ffffff") >=
    contrastRatio(background, "#101114")
    ? "#ffffff"
    : "#101114";
}

// ---------------------------------------------------------------------------
// Resolver — the ONE code path for live app and preview
// ---------------------------------------------------------------------------

export function resolveThemeTokens(
  theme: TenantTheme | null,
  mode: ThemeMode,
): ThemeTokens {
  const base = NOVAKORE_BASE[mode];
  if (!theme) return { ...base };

  const c = theme.colors;
  const accent =
    (mode === "light" ? c.accentLight : c.accentDark) ?? base.accent;
  const background =
    (mode === "light" ? c.backgroundLight : c.backgroundDark) ??
    base.background;
  const surface =
    (mode === "light" ? c.surfaceLight : c.surfaceDark) ?? base.surface;
  const textPrimary =
    (mode === "light" ? c.textPrimaryLight : c.textPrimaryDark) ??
    base.textPrimary;
  const secondary =
    (mode === "light" ? c.secondaryLight : c.secondaryDark) ?? base.secondary;

  const customizedAccent = accent !== base.accent;
  const customizedSurface = surface !== base.surface;
  const customizedBackground = background !== base.background;

  return {
    ...base,
    background,
    backgroundElevated: customizedBackground
      ? shiftColor(background, mode === "dark" ? 0.05 : 1)
      : base.backgroundElevated,
    backgroundSubtle: customizedBackground
      ? shiftColor(background, mode === "dark" ? 0.02 : -0.03)
      : base.backgroundSubtle,
    surface,
    surfaceElevated: customizedSurface
      ? shiftColor(surface, mode === "dark" ? 0.04 : 0)
      : base.surfaceElevated,
    surfaceInteractive: customizedSurface
      ? shiftColor(surface, mode === "dark" ? 0.07 : -0.04)
      : base.surfaceInteractive,
    textPrimary,
    textInverse:
      bestContrastText(textPrimary) === "#ffffff" ? "#101114" : "#ffffff",
    accent,
    // Derived state tokens (layer 4): hover/active shift toward depth.
    accentHover: customizedAccent
      ? shiftColor(accent, mode === "dark" ? 0.12 : -0.12)
      : base.accentHover,
    accentActive: customizedAccent
      ? shiftColor(accent, mode === "dark" ? -0.1 : -0.22)
      : base.accentActive,
    accentContrast: customizedAccent
      ? bestContrastText(accent)
      : base.accentContrast,
    secondary,
    // Protected tokens intentionally copied from base only:
    focusRing: base.focusRing,
    success: base.success,
    warning: base.warning,
    danger: base.danger,
    info: base.info,
  };
}

// ---------------------------------------------------------------------------
// Contrast policy (tenant-theming.md §4) — measured, not asserted
// ---------------------------------------------------------------------------

/** Publication is refused below this accent/contrast-text ratio. */
export const CONTRAST_BLOCKING_MIN = 3.0;
/** Below this, text pairings block; accent pairings warn. */
export const CONTRAST_TEXT_MIN = 4.5;

export interface ContrastIssue {
  mode: ThemeMode;
  pairing: string;
  ratio: number;
  required: number;
  level: "blocking" | "warning";
}

export function evaluateThemeContrast(
  theme: TenantTheme | null,
): ContrastIssue[] {
  const issues: ContrastIssue[] = [];
  for (const mode of ["light", "dark"] as const) {
    const t = resolveThemeTokens(theme, mode);
    const push = (
      pairing: string,
      ratio: number,
      required: number,
      level: ContrastIssue["level"],
    ) =>
      issues.push({
        mode,
        pairing,
        ratio: Math.round(ratio * 100) / 100,
        required,
        level,
      });

    const accentText = contrastRatio(t.accent, t.accentContrast);
    if (accentText < CONTRAST_BLOCKING_MIN) {
      push(
        "accent vs accent text",
        accentText,
        CONTRAST_BLOCKING_MIN,
        "blocking",
      );
    } else if (accentText < CONTRAST_TEXT_MIN) {
      push("accent vs accent text", accentText, CONTRAST_TEXT_MIN, "warning");
    }

    const bodyText = contrastRatio(t.textPrimary, t.background);
    if (bodyText < CONTRAST_TEXT_MIN) {
      push(
        "primary text vs background",
        bodyText,
        CONTRAST_TEXT_MIN,
        "blocking",
      );
    }

    const surfaceText = contrastRatio(t.textPrimary, t.surface);
    if (surfaceText < CONTRAST_TEXT_MIN) {
      push(
        "primary text vs surface",
        surfaceText,
        CONTRAST_TEXT_MIN,
        "blocking",
      );
    }

    const accentOnBackground = contrastRatio(t.accent, t.background);
    if (accentOnBackground < CONTRAST_BLOCKING_MIN) {
      push(
        "accent vs background",
        accentOnBackground,
        CONTRAST_BLOCKING_MIN,
        "warning",
      );
    }
  }
  return issues;
}

export function themeHasBlockingContrast(theme: TenantTheme | null): boolean {
  return evaluateThemeContrast(theme).some((i) => i.level === "blocking");
}

// ---------------------------------------------------------------------------
// Font + radius mappings (single source for CSS emission)
// ---------------------------------------------------------------------------

export const FONT_STACKS: Record<FontChoice, string> = {
  geist: "var(--font-geist-sans), system-ui, sans-serif",
  inter: "var(--font-inter), system-ui, sans-serif",
  system: 'system-ui, -apple-system, "Segoe UI", sans-serif',
};

export const RADIUS_MULTIPLIER: Record<RadiusProfile, number> = {
  square: 0,
  balanced: 1,
  soft: 1.35,
};

/** Default tenant theme derived from Phase 1A legacy branding columns. */
export function themeFromLegacyBranding(legacy: {
  accent_light: string;
  accent_dark: string;
  secondary_accent_light?: string | null;
  secondary_accent_dark?: string | null;
  font_family?: string;
  radius_scale?: string;
}): TenantTheme {
  const legacyFont: FontChoice =
    legacy.font_family === "system" ? "system" : "geist"; // 'serif' collapses to geist
  const legacyRadius: RadiusProfile =
    legacy.radius_scale === "small"
      ? "square"
      : legacy.radius_scale === "large"
        ? "soft"
        : "balanced";
  return tenantThemeSchema.parse({
    schemaVersion: THEME_SCHEMA_VERSION,
    colors: {
      accentLight: legacy.accent_light,
      accentDark: legacy.accent_dark,
      ...(legacy.secondary_accent_light
        ? { secondaryLight: legacy.secondary_accent_light }
        : {}),
      ...(legacy.secondary_accent_dark
        ? { secondaryDark: legacy.secondary_accent_dark }
        : {}),
    },
    typography: { interfaceFont: legacyFont },
    shape: { radiusProfile: legacyRadius },
    modes: { availability: "both", defaultMode: "system" },
  });
}
