import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";

/**
 * Shared authenticated clients for the real-DB suite.
 *
 * `vitest.globalSetup.ts` signs every seeded account in ONCE and writes the
 * access tokens here. Clients are then built from a token with an
 * Authorization header, which costs no auth request — RLS still sees the
 * real user through the JWT, so isolation is tested exactly as before.
 *
 * Why this exists: a full run used to issue ~35 sign-ins and trip Supabase's
 * auth rate limit, producing `beforeAll` failures that looked like code
 * regressions (each file passed in isolation). See the operations runbook.
 *
 * Falls back to a real sign-in when a token is unavailable, so behaviour is
 * unchanged if global setup did not run.
 *
 * IMPORTANT: never call `auth.signOut()` on a client from here. Sign-out
 * revokes the user's refresh tokens globally, which would break every other
 * file sharing that account. Global teardown removes the token file.
 */

export type Client = SupabaseClient<Database>;

const url = process.env.NOVAKORE_TEST_SUPABASE_URL;
const anonKey = process.env.NOVAKORE_TEST_SUPABASE_ANON_KEY;
export const DEV_PASSWORD =
  process.env.NOVAKORE_TEST_PASSWORD ?? "NovaKore-dev-password-1";

interface Pooled {
  accessToken: string;
  userId: string;
}

let tokens: Record<string, Pooled> | null = null;
function tokenFor(email: string): Pooled | undefined {
  if (tokens === null) {
    const file = resolve(import.meta.dirname, "../../.vitest-sessions.json");
    try {
      tokens = existsSync(file)
        ? (JSON.parse(readFileSync(file, "utf8")) as Record<string, Pooled>)
        : {};
    } catch {
      tokens = {};
    }
  }
  return tokens[email];
}

/**
 * The auth user id for a pooled account.
 *
 * Prefer this over `client.auth.getUser()`: a pooled client authenticates
 * with an Authorization header and holds no local session, so `getUser()`
 * returns null on it. Falls back to a live lookup when the account was not
 * pooled.
 */
export async function userIdFor(email: string): Promise<string> {
  const pooled = tokenFor(email);
  if (pooled) return pooled.userId;
  const client = await signedIn(email);
  const { data } = await client.auth.getUser();
  if (!data.user) throw new Error(`could not resolve user id for ${email}`);
  return data.user.id;
}

/** An unauthenticated client (anon role). */
export function bareClient(): Client {
  return createClient<Database>(url!, anonKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const cache = new Map<string, Promise<Client>>();

/**
 * A client authenticated as `email`. Reuses the pre-authenticated token when
 * available; otherwise signs in for real (and caches it).
 */
export function signedIn(email: string): Promise<Client> {
  const existing = cache.get(email);
  if (existing) return existing;

  const pending = (async (): Promise<Client> => {
    const pooled = tokenFor(email);
    if (pooled) {
      return createClient<Database>(url!, anonKey!, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: {
          headers: { Authorization: `Bearer ${pooled.accessToken}` },
        },
      });
    }
    const client = bareClient();
    const { error } = await client.auth.signInWithPassword({
      email,
      password: DEV_PASSWORD,
    });
    if (error) throw new Error(`sign-in failed for ${email}: ${error.message}`);
    return client;
  })();

  cache.set(email, pending);
  return pending;
}
