import { z } from "zod";

/**
 * Environment validation (owner secrets/environment rules, Phase 1A).
 *
 * - Server env is validated lazily, throws a clear error naming MISSING
 *   variable names only — never values.
 * - `SUPABASE_SERVICE_ROLE_KEY` must never reach browser code; `serverEnv()`
 *   refuses to run in a browser context at all.
 * - Public env contains ONLY `NEXT_PUBLIC_*` values, referenced statically so
 *   Next.js can inline them at build time.
 */

const urlSchema = z.url({ error: "must be a valid URL" });
const keySchema = z
  .string()
  .min(20, { error: "looks too short to be a valid key" });

const serverEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: urlSchema,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: keySchema,
  /**
   * Optional in Phase 1A: no named internal operation requires it yet.
   * When a future phase introduces one, move this to required alongside
   * that operation — never before.
   */
  SUPABASE_SERVICE_ROLE_KEY: keySchema.optional(),
  SUPABASE_PROJECT_ID: z.string().min(1).optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cachedServerEnv: ServerEnv | null = null;

export function serverEnv(): ServerEnv {
  if (typeof window !== "undefined") {
    throw new Error("serverEnv() must never be called from browser code.");
  }
  if (cachedServerEnv) return cachedServerEnv;

  const parsed = serverEnvSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_PROJECT_ID: process.env.SUPABASE_PROJECT_ID,
  });

  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(
      `Invalid or missing server environment variables:\n${problems}\n` +
        "Copy apps/web/.env.example to apps/web/.env.local and fill in the values " +
        "(see docs/development/supabase.md). Variable values are never printed.",
    );
  }

  cachedServerEnv = parsed.data;
  return cachedServerEnv;
}

const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: urlSchema,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: keySchema,
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;

let cachedPublicEnv: PublicEnv | null = null;

/** Client-safe env. Statically referenced so Next.js inlines values. */
export function publicEnv(): PublicEnv {
  if (cachedPublicEnv) return cachedPublicEnv;

  const parsed = publicEnvSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });

  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(
      `Invalid or missing public environment variables:\n${problems}`,
    );
  }

  cachedPublicEnv = parsed.data;
  return cachedPublicEnv;
}
