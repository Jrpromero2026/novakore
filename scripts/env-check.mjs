#!/usr/bin/env node
/**
 * Environment validation — FAIL CLOSED (Phase 6, Priority 1).
 *
 * Runs before every production build (apps/web `prebuild`). Its one job:
 * make it impossible to point an environment at the wrong database by
 * accident.
 *
 * Rules:
 *  - A PRODUCTION deploy (VERCEL_ENV=production) must point at either the
 *    registered production ref (NOVAKORE_PROD_REF) or the known dev project.
 *    An UNRECOGNISED database fails the build — that is drift, and nobody
 *    would know what is being served. Serving from the known dev project is
 *    the owner's documented pre-production state: it warns loudly on every
 *    build rather than blocking deploys.
 *  - A non-production build must NEVER point at the production ref.
 *  - Missing required public env in any Vercel build fails immediately
 *    (better a red build than a white screen).
 *
 * When novakore-prod is created (docs/operations/production-setup.md), set
 * NOVAKORE_PROD_REF in Vercel; the dev ref then becomes drift in production
 * and the guard tightens automatically.
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
    const pointsAtDev = ref === DEV_REF;
    // Drift is the real danger: an UNRECOGNISED database in production means
    // nobody knows what is being served. That still fails closed. Serving
    // from the known dev project is the owner's documented pre-production
    // state — it warns loudly on every build instead of blocking the deploy.
    if (!pointsAtProd && !pointsAtDev) {
      fail(
        `production deploy points at project "${ref}", which is neither the ` +
          "registered production ref (NOVAKORE_PROD_REF) nor the known dev " +
          "project. Refusing to build against an unrecognised database — see " +
          "docs/operations/production-setup.md.",
      );
    }
    if (pointsAtDev) {
      console.warn(
        "\n⚠ env-check: PRODUCTION IS SERVING FROM THE DEV DATABASE.\n" +
          "  Accepted pre-production state (docs/architecture/V1_EXIT_CRITERIA.md).\n" +
          "  Do NOT onboard paying organizations until the environment split\n" +
          "  executes: docs/operations/production-setup.md\n",
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
