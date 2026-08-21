import { TERM_KEYS, contrastRatio } from "@novakore/domain";
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

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, { error: "Enter your password." }),
});

export const magicLinkSchema = z.object({ email: emailSchema });

export const passwordResetRequestSchema = z.object({ email: emailSchema });

/**
 * Setting a NEW password, unlike signing in with an existing one.
 *
 * The floor is 12 rather than the more common 8: this platform holds
 * emergency procedures and competency records, and the accounts being
 * protected are staff accounts rather than consumer logins. Supabase's
 * leaked-password protection is the second layer and is enabled at the
 * project level, not here.
 */
export const newPasswordSchema = z
  .object({
    password: z
      .string()
      .min(12, { error: "Use at least 12 characters." })
      .max(200, { error: "That is longer than 200 characters." }),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    error: "Both passwords must match.",
    path: ["confirm"],
  });

/**
 * The use cases offered at signup.
 *
 * A closed set rather than free text so the answer is worth segmenting on
 * later, with "other" plus an optional line for everything the list misses.
 * The value is descriptive only — it grants nothing and restricts nothing,
 * and the database mirrors this list as a CHECK constraint.
 */
export const USE_CASES = [
  { value: "certification", label: "Certifying professionals" },
  { value: "corporate_training", label: "Training our staff" },
  { value: "coaching", label: "Coaching clients" },
  { value: "education", label: "Teaching students" },
  { value: "association", label: "Serving our members" },
  { value: "other", label: "Something else" },
] as const;

export const signUpSchema = z
  .object({
    email: emailSchema,
    // Same floor as setting a new password: this account will own an
    // organization's records from the moment it exists.
    password: z
      .string()
      .min(12, { error: "Use at least 12 characters." })
      .max(200, { error: "That is longer than 200 characters." }),
    organizationName: z
      .string()
      .trim()
      .min(2, { error: "Enter your organization's name." })
      .max(120, { error: "That is longer than 120 characters." }),
    useCase: z.enum(USE_CASES.map((u) => u.value) as [string, ...string[]], {
      error: "Tell us what you'll use NovaKore for.",
    }),
    useCaseDetail: z.string().trim().max(280).optional(),
  })
  .strict();

export const createOrganizationSchema = signUpSchema.pick({
  organizationName: true,
  useCase: true,
  useCaseDetail: true,
});

export const inviteMemberSchema = z.object({ email: emailSchema });

export const organizationNameSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, { error: "Name must be at least 2 characters." })
    .max(120),
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

// Contrast math lives in @novakore/domain (single implementation shared by
// the theme resolver, the brand studio, and these legacy helpers).
export { contrastRatio };
