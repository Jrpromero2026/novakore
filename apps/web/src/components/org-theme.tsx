const HEX = /^#[0-9a-f]{6}$/i;
const FONTS = new Set(["system", "geist", "serif"]);
const RADII = new Set(["small", "medium", "large"]);

export interface OrgTheme {
  accent_light: string;
  accent_dark: string;
  font_family: string;
  radius_scale: string;
}

/**
 * Applies tenant branding as scoped CSS custom properties.
 *
 * CSS-injection boundary: values are re-validated here (defense in depth on
 * top of the database CHECK constraints) and only exact hex strings / enum
 * values are ever emitted. Arbitrary tenant CSS is impossible.
 */
export function OrgThemeStyle({ theme }: { theme: OrgTheme }) {
  const light = HEX.test(theme.accent_light) ? theme.accent_light : "#4f46e5";
  const dark = HEX.test(theme.accent_dark) ? theme.accent_dark : "#818cf8";
  const css = `:root{--accent-light-override:${light};--accent-dark-override:${dark};--accent:${light};}
@media (prefers-color-scheme: dark){:root{--accent:${dark};}}
:root[data-theme="light"]{--accent:${light};}
:root[data-theme="dark"]{--accent:${dark};}`;
  return <style>{css}</style>;
}

export function orgThemeDataAttributes(
  theme: OrgTheme,
): Record<string, string> {
  return {
    "data-font": FONTS.has(theme.font_family) ? theme.font_family : "geist",
    "data-radius": RADII.has(theme.radius_scale)
      ? theme.radius_scale
      : "medium",
  };
}
