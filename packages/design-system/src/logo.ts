/**
 * NovaKore logo asset registry.
 *
 * The mark: six expanding modular arms around a central knowledge core,
 * sweeping Nova Purple → Electric Indigo → Core Blue. Vector sources live in
 * apps/web/public/brand; rasters are derived via scripts/brand-rasters.mjs.
 * Usage rules: docs/brand/logo.md. In-app rendering goes through the
 * components in apps/web/src/components/brand.tsx — never ad-hoc <img> tags.
 */

/** Public URL paths of the platform logo assets (served from /brand). */
export const LOGO_ASSETS = {
  /** Adaptive horizontal lockup (prefers-color-scheme aware wordmark). */
  logo: "/brand/logo.svg",
  /** Lockup tuned for light backgrounds (ink wordmark). */
  logoLight: "/brand/logo-light.svg",
  /** Lockup tuned for dark backgrounds (white wordmark). */
  logoDark: "/brand/logo-dark.svg",
  logoMonoWhite: "/brand/logo-mono-white.svg",
  logoMonoBlack: "/brand/logo-mono-black.svg",
  /** Square mark, transparent background. */
  icon: "/brand/icon.svg",
  /** Mark on a Cloud tile (light contexts). */
  iconLight: "/brand/icon-light.svg",
  /** Mark on an Obsidian tile (dark contexts, app tiles). */
  iconDark: "/brand/icon-dark.svg",
  iconMonoWhite: "/brand/icon-mono-white.svg",
  iconMonoBlack: "/brand/icon-mono-black.svg",
  icon192: "/brand/icon-192.png",
  icon512: "/brand/icon-512.png",
  iconMaskable512: "/brand/icon-maskable-512.png",
  socialPreview: "/brand/social-preview.png",
  splash: "/brand/splash.svg",
} as const;

export type LogoAsset = keyof typeof LOGO_ASSETS;

/** Minimum rendered sizes (px) below which a variant may not be used. */
export const LOGO_MIN_SIZES = {
  /** Horizontal lockup minimum height. */
  lockup: 24,
  /** Square mark minimum edge. */
  mark: 16,
} as const;

/** Clear space around the lockup, as a multiple of the mark height. */
export const LOGO_CLEAR_SPACE_RATIO = 0.25;
