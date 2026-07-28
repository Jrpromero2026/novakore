import { createBrowserClient, createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types/database";
import { publicEnv, serverEnv } from "./env";

export type NovaKoreClient = SupabaseClient<Database>;

/**
 * Cookie adapter contract, satisfied by Next.js `cookies()` in apps/web.
 * Kept framework-agnostic so the package never imports Next.js.
 */
export interface CookieAdapter {
  getAll(): { name: string; value: string }[];
  setAll(cookies: { name: string; value: string; options?: object }[]): void;
}

/** Browser client — anon key only. Never handles the service-role key. */
export function createNovaKoreBrowserClient(): NovaKoreClient {
  const env = publicEnv();
  return createBrowserClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

/**
 * Server client bound to the requesting user's session cookies.
 * All tenant reads/writes flow through this client so RLS applies.
 */
export function createNovaKoreServerClient(cookies: CookieAdapter): NovaKoreClient {
  const env = serverEnv();
  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => cookies.getAll(),
        setAll: (list) => cookies.setAll(list),
      },
    },
  );
}
