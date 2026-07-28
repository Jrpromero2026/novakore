import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Load repo-root .env.test.local (gitignored) so the RLS isolation suite can
 * reach the real Supabase instance. Values never get logged.
 */
const envFile = resolve(import.meta.dirname, "../../.env.test.local");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (match && match[1] && process.env[match[1]] === undefined) {
      process.env[match[1]] = match[2];
    }
  }
}
