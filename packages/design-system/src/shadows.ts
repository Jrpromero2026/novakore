/**
 * NovaKore elevation.
 *
 * Shadows are layered and quiet. Dark mode separates surfaces with borders
 * and tone, not glow — dark shadows exist for overlays only.
 */

import type { ThemeMode } from "./colors";

export const SHADOWS: Record<ThemeMode, { raised: string; overlay: string }> = {
  light: {
    raised: "0 1px 2px rgb(16 17 20 / 0.05), 0 4px 12px rgb(16 17 20 / 0.06)",
    overlay: "0 4px 12px rgb(16 17 20 / 0.1), 0 12px 32px rgb(16 17 20 / 0.16)",
  },
  dark: {
    raised: "0 1px 2px rgb(0 0 0 / 0.45), 0 4px 12px rgb(0 0 0 / 0.35)",
    overlay: "0 4px 12px rgb(0 0 0 / 0.5), 0 12px 32px rgb(0 0 0 / 0.55)",
  },
};
