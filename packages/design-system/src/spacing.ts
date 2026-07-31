/**
 * NovaKore spacing and layout tokens.
 *
 * Spacing follows the Tailwind 4-px base scale already used across the app;
 * layout maxima mirror the globals.css `--layout-*` variables.
 */

/** Base spacing unit in px (Tailwind scale unit). */
export const SPACE_UNIT = 4;

/** Canonical spacing steps (px) used by the interface. */
export const SPACE_SCALE = [0, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64] as const;

/** Layout dimension tokens — mirror of globals.css. */
export const LAYOUT = {
  pageMax: "72rem",
  formMax: "42rem",
  sidebar: "13rem",
  header: "3.25rem",
} as const;

/** Named z-index layers — mirror of globals.css. */
export const Z_LAYERS = {
  nav: 30,
  panel: 40,
  overlay: 50,
  toast: 60,
} as const;
