/**
 * NovaKore radius tokens.
 *
 * Restrained 6–18 px scale; tenant radius profiles scale the unit
 * (RADIUS_PROFILES in @novakore/domain) without introducing new steps.
 */

/** Radius steps in px at the default (1.0) profile. */
export const RADIUS = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 18,
} as const;

/** Icon/app tile corner radius as a fraction of tile size (96/512). */
export const APP_TILE_RADIUS_RATIO = 0.1875;
