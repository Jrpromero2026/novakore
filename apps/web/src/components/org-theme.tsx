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

/** CSS declarations for tokens that differ from base; validated hex only. */
export function themeOverrideDeclarations(
  theme: TenantTheme | null,
  mode: ThemeMode,
): string {
  if (!theme) return "";
  const base = NOVAKORE_BASE[mode];
  const resolved = resolveThemeTokens(theme, mode);
  const declarations: string[] = [];
  for (const [token, cssVar] of Object.entries(TOKEN_TO_VAR) as [
    keyof typeof TOKEN_TO_VAR,
    string,
  ][]) {
    const value = resolved[token];
    if (value !== base[token] && HEX.test(value)) {
      declarations.push(`${cssVar}:${value.toLowerCase()}`);
    }
  }
  return declarations.join(";");
}

export function OrgThemeStyle({ theme }: { theme: TenantTheme | null }) {
  if (!theme) return null;
  const light = themeOverrideDeclarations(theme, "light");
  const dark = themeOverrideDeclarations(theme, "dark");
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
