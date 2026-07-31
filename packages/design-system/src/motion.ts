/**
 * NovaKore motion tokens.
 *
 * Motion communicates state change or spatial continuity only — no bounce,
 * no ambient animation. `prefers-reduced-motion` collapses all motion
 * (implemented globally in globals.css).
 */

export const MOTION_DURATION = {
  fast: "140ms",
  standard: "200ms",
  slow: "300ms",
} as const;

export const MOTION_EASING = {
  /** Entrances. */
  out: "cubic-bezier(0.16, 1, 0.3, 1)",
  /** State changes. */
  inOut: "cubic-bezier(0.65, 0, 0.35, 1)",
} as const;
