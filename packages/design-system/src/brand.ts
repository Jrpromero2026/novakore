/**
 * NovaKore brand identity — canonical, non-visual brand facts.
 *
 * NovaKore is enterprise learning infrastructure, not an LMS. Every consumer
 * of these constants (metadata, covers, documentation, emails) inherits that
 * positioning. Voice rules live in docs/brand/voice.md; the vocabulary lists
 * here are the enforceable subset.
 */

export const BRAND_NAME = "NovaKore";

export const BRAND_TAGLINE = "Knowledge at the Core";

/** One-sentence descriptor used for metadata and social cards. */
export const BRAND_DESCRIPTION =
  "Learning infrastructure for professional organizations.";

/** Longer positioning statement for documentation and covers. */
export const BRAND_MISSION =
  "NovaKore is the knowledge infrastructure layer for professional " +
  "organizations: modular, governed, white-labeled systems for learning, " +
  "assessment, and credentialing.";

/**
 * Preferred vocabulary. Marketing and documentation surfaces use these terms;
 * canonical entity names in code and schema never change (ADR-003) —
 * tenant-facing entity words pass through the terminology resolver.
 */
export const BRAND_VOCABULARY = [
  "learning infrastructure",
  "knowledge infrastructure",
  "knowledge systems",
  "organizations",
  "academies",
  "journeys",
  "programs",
  "members",
  "credentials",
  "standards",
] as const;

/**
 * Banned vocabulary on NovaKore-identity surfaces (marketing, docs, platform
 * chrome). These read as consumer LMS / marketplace language.
 */
export const BRAND_BANNED_VOCABULARY = [
  "learning platform",
  "training platform",
  "LMS",
  "course marketplace",
  "creators",
  "supercharge",
  "revolutionary",
  "all-in-one",
] as const;

/** Brand attributes the visual system must communicate. */
export const BRAND_ATTRIBUTES = [
  "knowledge",
  "growth",
  "connected systems",
  "modular architecture",
  "intelligent infrastructure",
] as const;
