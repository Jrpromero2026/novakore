import { TERM_KEYS } from "@novakore/domain";
import { z } from "zod";

/**
 * Input validation for server actions. Pure and unit-tested. The database
 * enforces the same rules again via CHECK constraints — these exist to give
 * humans good error messages before the round-trip.
 */

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: "Enter a valid email address." }));

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/, {
    error:
      "Use lowercase letters, numbers, and single hyphens (2–63 characters).",
  })
  .refine((s) => !s.includes("--"), {
    error: "Slugs cannot contain consecutive hyphens.",
  });

const hexColor = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, {
    error: "Use a 6-digit hex color like #6d28d9.",
  });

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, { error: "Enter your password." }),
});

export const magicLinkSchema = z.object({ email: emailSchema });

export const inviteMemberSchema = z.object({ email: emailSchema });

export const organizationNameSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, { error: "Name must be at least 2 characters." })
    .max(120),
});

export const brandingSchema = z.object({
  display_name: z.union([z.literal(""), z.string().trim().min(2).max(120)]),
  accent_light: hexColor,
  accent_dark: hexColor,
  font_family: z.enum(["system", "geist", "serif"]),
  radius_scale: z.enum(["small", "medium", "large"]),
});

export const terminologyEntrySchema = z.object({
  term_key: z.enum(TERM_KEYS),
  singular: z
    .string()
    .trim()
    .min(1, { error: "Singular is required." })
    .max(40),
  plural: z.string().trim().min(1, { error: "Plural is required." }).max(40),
  short_form: z.union([z.literal(""), z.string().trim().min(1).max(20)]),
});

export const academySchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, { error: "Name must be at least 2 characters." })
    .max(120),
  slug: slugSchema,
  description: z.union([z.literal(""), z.string().trim().max(2000)]),
});

export const roleSchema = z.object({
  key: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z][a-z0-9_]{1,47}$/, {
      error:
        "Key must start with a letter and use letters, numbers, or underscores.",
    }),
  name: z.string().trim().min(2).max(60),
  description: z.union([z.literal(""), z.string().trim().max(500)]),
});

/**
 * Contrast guidance for tenant accents (branding requirement: validate or
 * flag unsafe combinations). Returns WCAG-ish relative luminance contrast
 * against white and near-black text.
 */
export function contrastRatio(hexA: string, hexB: string): number {
  const lum = (hex: string) => {
    const n = parseInt(hex.slice(1), 16);
    const channels = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return (
      0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!
    );
  };
  const [l1, l2] = [lum(hexA), lum(hexB)].sort((a, b) => b - a);
  return (l1! + 0.05) / (l2! + 0.05);
}

/** Flags accents that will not sustain readable white/black button text. */
export function accentWarnings(input: {
  accent_light: string;
  accent_dark: string;
}): string[] {
  const warnings: string[] = [];
  if (
    contrastRatio(input.accent_light, "#ffffff") < 3 &&
    contrastRatio(input.accent_light, "#111111") < 3
  ) {
    warnings.push(
      "Light-mode accent has low contrast with both white and black text.",
    );
  }
  if (
    contrastRatio(input.accent_dark, "#111111") < 3 &&
    contrastRatio(input.accent_dark, "#ffffff") < 3
  ) {
    warnings.push(
      "Dark-mode accent has low contrast with both white and black text.",
    );
  }
  return warnings;
}
