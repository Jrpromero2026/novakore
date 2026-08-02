#!/usr/bin/env node
/**
 * Environment validation — FAIL CLOSED (Phase 6, Priority 1).
 *
 * Runs before every production build (apps/web `prebuild`). Its one job:
 * make it impossible to point an environment at the wrong database by
 * accident.
 *
 * Rules:
 *  - A PRODUCTION deploy (VERCEL_ENV=production) must either
 *      (a) point at the registered production project ref, or
 *      (b) carry the explicit acknowledgment NOVAKORE_ALLOW_DEV_DB=1
 *          (the current state: no production Supabase project exists yet,
 *          so the owner consciously accepts serving from the dev project).
 *    Anything else fails the build.
 *  - A non-production build must NEVER point at the production ref.
 *  - Missing required public env in any Vercel build fails immediately
 *    (better a red build than a white screen).
 *
 * When novakore-prod is created (docs/operations/production-setup.md),
 * set PROD_REF below and remove NOVAKORE_ALLOW_DEV_DB from Vercel.
 */

const PROD_REF = process.env.NOVAKORE_PROD_REF ?? null; // e.g. "abcd1234efgh5678"
const DEV_REF = "mivqjcxpfanfzjkwwxcc";

const vercelEnv = process.env.VERCEL_ENV ?? null; // production | preview | development | null (local/CI)
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const refMatch = /^https:\/\/([a-z0-9]+)\.supabase\.co/.exec(url);
const ref = refMatch ? refMatch[1] : null;

const fail = (msg) => {
  console.error(`\n✖ env-check FAILED (fail-closed): ${msg}\n`);
  process.exit(1);
};

if (vercelEnv) {
  if (!url || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    fail("NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY missing in a Vercel build.");
  }

  if (vercelEnv === "production") {
    const pointsAtProd = PROD_REF !== null && ref === PROD_REF;
    const devAcknowledged = process.env.NOVAKORE_ALLOW_DEV_DB === "1";
    if (!pointsAtProd && !devAcknowledged) {
      fail(
        `production deploy points at project "${ref}" which is not the registered ` +
          "production ref, and NOVAKORE_ALLOW_DEV_DB=1 is not set. Either wire the " +
          "production project (docs/operations/production-setup.md) or explicitly " +
          "acknowledge the dev database.",
      );
    }
    if (devAcknowledged && ref === DEV_REF) {
      console.warn(
        "⚠ env-check: production is serving from the DEV database under the " +
          "NOVAKORE_ALLOW_DEV_DB acknowledgment. Do not onboard paying " +
          "organizations in this state.",
      );
    }
  } else if (PROD_REF !== null && ref === PROD_REF) {
    fail(
      `non-production environment "${vercelEnv}" points at the PRODUCTION database.`,
    );
  }
}

console.log(
  `✓ env-check passed (${vercelEnv ?? "local/ci"}${ref ? ` → ${ref}` : ""})`,
);
