#!/usr/bin/env node
/**
 * Generate (or verify) TypeScript types from the database schema.
 *
 *   npm run db:types         — regenerate packages/database/src/types/database.ts
 *   npm run db:types:check   — fail if the committed types are stale
 *
 * Uses the local Supabase stack when NOVAKORE_DB_TYPES_LOCAL=1 (requires
 * Docker + `supabase start`), otherwise the linked/dev project via
 * SUPABASE_PROJECT_ID (from env or apps/web/.env.local). Requires Supabase
 * CLI auth (`npx supabase login`) for remote generation.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const outFile = resolve(root, "packages/database/src/types/database.ts");
const checkMode = process.argv.includes("--check");

const HEADER = `/**
 * GENERATED FILE — do not edit by hand.
 *
 * Source: novakore-dev database schema (supabase/migrations are the source
 * of truth). Regenerate with \`npm run db:types\`; verify freshness with
 * \`npm run db:types:check\` (see docs/development/supabase.md).
 */
`;

function readEnvLocal(name) {
  if (process.env[name]) return process.env[name];
  const envPath = resolve(root, "apps/web/.env.local");
  if (!existsSync(envPath)) return undefined;
  const match = readFileSync(envPath, "utf8").match(
    new RegExp(`^${name}=(.*)$`, "m"),
  );
  return match?.[1]?.trim() || undefined;
}

const args = ["supabase", "gen", "types", "typescript", "--schema", "public"];
if (process.env.NOVAKORE_DB_TYPES_LOCAL === "1") {
  args.push("--local");
} else {
  const projectId = readEnvLocal("SUPABASE_PROJECT_ID");
  if (!projectId) {
    console.error(
      "SUPABASE_PROJECT_ID is not set (env or apps/web/.env.local). " +
        "Set it, or use NOVAKORE_DB_TYPES_LOCAL=1 with a running local stack.",
    );
    process.exit(1);
  }
  args.push("--project-id", projectId);
}

const raw = execFileSync("npx", args, {
  cwd: root,
  encoding: "utf8",
  shell: true,
});
let generated = HEADER + raw;
// Normalize with the repo's prettier config so generate + check agree.
generated = execFileSync("npx", ["prettier", "--stdin-filepath", outFile], {
  cwd: root,
  encoding: "utf8",
  input: generated,
  shell: true,
});

if (checkMode) {
  const committed = readFileSync(outFile, "utf8").replace(/\r\n/g, "\n");
  if (committed !== generated.replace(/\r\n/g, "\n")) {
    console.error(
      "STALE GENERATED TYPES: packages/database/src/types/database.ts does not " +
        "match the current schema. Run `npm run db:types` and commit the result.",
    );
    process.exit(1);
  }
  console.log("Generated database types are up to date.");
} else {
  writeFileSync(outFile, generated);
  console.log("Wrote " + outFile);
}
