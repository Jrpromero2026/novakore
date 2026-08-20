import {
  FONT_STACKS,
  NOVAKORE_BASE,
  RADIUS_MULTIPLIER,
  resolveThemeTokens,
  type TenantTheme,
  type ThemeMode,
  type ThemeTokens,
} from "@novakore/domain";

/**
 * Organization theme application (tenant-theming.md).
 *
 * Emits ONLY tokens that differ from the NovaKore base, per mode, computed
 * by the same `resolveThemeTokens` resolver the brand-studio preview uses.
 * Values are schema-validated hex (re-checked here — defense in depth);
 * protected semantics never appear because the resolver never lets tenant
 * input reach them. Arbitrary tenant CSS is impossible.
 */

const HEX = /^#[0-9a-f]{6}$/i;

const TOKEN_TO_VAR: Record<keyof Omit<ThemeTokens, "secondary">, string> = {
  background: "--background",
  backgroundElevated: "--background-elevated",
  backgroundSubtle: "--background-subtle",
  surface: "--surface",
  surfaceElevated: "--surface-elevated",
  surfaceInteractive: "--surface-interactive",
  textPrimary: "--text-primary",
  textSecondary: "--text-secondary",
  textMuted: "--text-muted",
  textInverse: "--text-inverse",
  borderDefault: "--border-default",
  borderStrong: "--border-strong",
  borderSubtle: "--border-subtle",
  accent: "--accent",
  accentHover: "--accent-hover",
  accentActive: "--accent-active",
  accentContrast: "--accent-contrast",
  focusRing: "--focus-ring",
  success: "--success",
  warning: "--warning",
  danger: "--danger",
  info: "--info",
};

/** Tokens that differ from the NovaKore base for one mode; validated hex. */
function overridesFor(
  theme: TenantTheme,
  mode: ThemeMode,
): Map<string, string> {
  const base = NOVAKORE_BASE[mode];
  const resolved = resolveThemeTokens(theme, mode);
  const out = new Map<string, string>();
  for (const [token, cssVar] of Object.entries(TOKEN_TO_VAR) as [
    keyof typeof TOKEN_TO_VAR,
    string,
  ][]) {
    const value = resolved[token];
    if (value !== base[token] && HEX.test(value)) {
      out.set(cssVar, value.toLowerCase());
    }
  }
  return out;
}

const serialize = (m: Map<string, string>) =>
  [...m].map(([k, v]) => `${k}:${v}`).join(";");

/** CSS declarations for tokens that differ from base; validated hex only. */
export function themeOverrideDeclarations(
  theme: TenantTheme | null,
  mode: ThemeMode,
): string {
  if (!theme) return "";
  return serialize(overridesFor(theme, mode));
}

/**
 * The dark declarations, including every light override neutralised.
 *
 * The light block is emitted unconditionally on `:root` and this stylesheet
 * comes after globals.css, so a light override at equal specificity wins
 * against the dark `@media` block that came earlier. A tenant whose brand
 * background differs from base in light but MATCHES base in dark therefore
 * emitted nothing for dark, and the light background stayed in force while
 * the text tokens correctly flipped: near-white text on a cream ground, at
 * about 1:1 contrast, for anyone whose OS prefers dark and who has not
 * explicitly chosen a theme in the app.
 *
 * So dark must restate any token light touched, at its base dark value,
 * rather than only the ones the tenant customised.
 */
function darkDeclarations(theme: TenantTheme): string {
  const light = overridesFor(theme, "light");
  const dark = overridesFor(theme, "dark");
  const baseDark = NOVAKORE_BASE["dark"];
  const byVar = new Map(
    (Object.entries(TOKEN_TO_VAR) as [keyof typeof TOKEN_TO_VAR, string][]).map(
      ([token, cssVar]) => [cssVar, token],
    ),
  );

  for (const cssVar of light.keys()) {
    if (dark.has(cssVar)) continue;
    const token = byVar.get(cssVar);
    const value = token ? baseDark[token] : undefined;
    if (value && HEX.test(value)) dark.set(cssVar, value.toLowerCase());
  }
  return serialize(dark);
}

export function OrgThemeStyle({ theme }: { theme: TenantTheme | null }) {
  if (!theme) return null;
  const light = themeOverrideDeclarations(theme, "light");
  const dark = darkDeclarations(theme);
  const fontStack = FONT_STACKS[theme.typography.interfaceFont];

  // Enum-validated non-color preferences resolve to numeric/keyword values
  // here — tenant strings never reach CSS directly.
  const radiusUnit = RADIUS_MULTIPLIER[theme.shape.radiusProfile];

  const css = [
    `:root{--org-font:${fontStack};--radius-unit:${radiusUnit}}`,
    light ? `:root{${light}}` : "",
    dark ? `@media (prefers-color-scheme: dark){:root{${dark}}}` : "",
    light ? `:root[data-theme="light"]{${light}}` : "",
    dark ? `:root[data-theme="dark"]{${dark}}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return <style>{css}</style>;
}
