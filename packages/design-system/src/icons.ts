/**
 * NovaKore iconography rules.
 *
 * Icons are geometric, stroke-consistent, and functional: they accompany
 * labels, never replace them, and never appear as decorative noise.
 */

/** Canonical icon grid (viewBox is 0 0 GRID GRID). */
export const ICON_GRID = 24;

/** Stroke width on the 24-px grid. */
export const ICON_STROKE_WIDTH = 1.75;

/** Stroke endings — consistent across every icon. */
export const ICON_STROKE_STYLE = {
  linecap: "round",
  linejoin: "round",
} as const;

/**
 * Icons inherit `currentColor`; they are never hardcoded to palette hex and
 * never recolored with the brand gradient (the gradient belongs to the logo).
 */
export const ICON_COLOR = "currentColor";
