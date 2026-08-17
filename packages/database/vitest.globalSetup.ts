import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

/**
 * One sign-in per account for the WHOLE real-DB suite.
 *
 * Every test file previously authenticated its own accounts. Files memoize
 * internally, but nothing was shared across files, so a full run issued
 * roughly 35 sign-ins — past Supabase's auth rate limit. The failure mode is
 * nasty: `beforeAll` blows up with "Request rate limit reached" and whole
 * files skip, which reads exactly like a code regression.
 *
 * This signs in each seeded account once, up front, and writes the resulting
 * access tokens to a gitignored file. Tests build clients from those tokens
 * with an Authorization header (see `src/__tests__/_session.ts`) and make no
 * auth calls at all.
 */

const TOKEN_FILE = resolve(import.meta.dirname, ".vitest-sessions.json");

/** Seeded fixtures only. Negative-test addresses are intentionally absent —
 *  tests that assert a sign-in FAILS must keep doing it for real. */
const ACCOUNTS = [
  "platform.admin@novakore.test",
  "alpha.owner@novakore.test",
  "alpha.admin@novakore.test",
  "alpha.academy@novakore.test",
  "alpha.reviewer@novakore.test",
  "alpha.author@novakore.test",
  "alpha.learner@novakore.test",
  "alpha.suspended@novakore.test",
  "alpha.removed@novakore.test",
  "bfh.owner@novakore.test",
  "bfh.instructor@novakore.test",
  "bfh.observer@novakore.test",
  "bfh.member@novakore.test",
  "bfh.coach@novakore.test",
];

function loadEnv() {
  const envFile = resolve(import.meta.dirname, "../../.env.test.local");
  if (!existsSync(envFile)) return;
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (match && match[1] && process.env[match[1]] === undefined) {
      process.env[match[1]] = match[2];
    }
  }
}

export async function setup() {
  loadEnv();
  const url = process.env.NOVAKORE_TEST_SUPABASE_URL;
  const anonKey = process.env.NOVAKORE_TEST_SUPABASE_ANON_KEY;
  const password =
    process.env.NOVAKORE_TEST_PASSWORD ?? "NovaKore-dev-password-1";
  // Without credentials the suite skips itself; nothing to pre-authenticate.
  if (!url || !anonKey) return;

  // Token + user id. The id is captured here because a header-authenticated
  // client has no local session, so `auth.getUser()` returns null on it.
  const tokens: Record<string, { accessToken: string; userId: string }> = {};
  // Sequential on purpose: a burst of parallel sign-ins is the very thing
  // that trips the rate limiter.
  for (const email of ACCOUNTS) {
    const client = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await client.auth.signInWithPassword({
      email,
      password,
    });
    if (error || !data.session) {
      // Not fatal: the account may not exist in this database. Tests fall
      // back to signing in directly and will report the real error.
      continue;
    }
    tokens[email] = {
      accessToken: data.session.access_token,
      userId: data.user!.id,
    };
  }

  writeFileSync(TOKEN_FILE, JSON.stringify(tokens), "utf8");
}

export function teardown() {
  // Access tokens are short-lived, but leaving them on disk is pointless.
  rmSync(TOKEN_FILE, { force: true });
}
