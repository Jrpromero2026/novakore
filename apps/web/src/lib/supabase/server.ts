import "server-only";
import { cookies } from "next/headers";
import {
  createNovaKoreServerClient,
  type NovaKoreClient,
} from "@novakore/database";

/**
 * Request-scoped Supabase client bound to the caller's session cookies.
 * Every tenant read/write in the app goes through this client, so RLS is
 * always in force underneath the server-side `can()` layer (ADR-006).
 */
export async function supabaseServer(): Promise<NovaKoreClient> {
  const cookieStore = await cookies();
  return createNovaKoreServerClient({
    getAll: () => cookieStore.getAll(),
    setAll: (list) => {
      try {
        for (const { name, value, options } of list) {
          cookieStore.set(
            name,
            value,
            options as Parameters<typeof cookieStore.set>[2],
          );
        }
      } catch {
        // Server Components cannot write cookies; the proxy refreshes sessions.
      }
    },
  });
}
