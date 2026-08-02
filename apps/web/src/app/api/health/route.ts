import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { publicEnv } from "@novakore/database";

export const dynamic = "force-dynamic";

/**
 * Operational health endpoint (Phase 6 — observability).
 *
 * Anonymous by design and safe by construction: it reports reachability and
 * latency, never data. The database probe runs as `anon` under full RLS —
 * a successful empty read proves PostgREST + Postgres + RLS are alive
 * without exposing a single row.
 */
export async function GET() {
  const startedAt = Date.now();
  const env = publicEnv();

  let db: { ok: boolean; latencyMs: number | null; error?: string } = {
    ok: false,
    latencyMs: null,
  };
  try {
    const anon = createClient(
      env.NEXT_PUBLIC_SUPABASE_URL,
      env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      { auth: { persistSession: false } },
    );
    const t0 = Date.now();
    // verify_credential is the platform's one deliberate anon-executable
    // RPC (public credential verification). A nonsense code exercises
    // PostgREST + Postgres + the function path and returns nothing.
    const { error } = await anon.rpc("verify_credential", {
      p_code: "HEALTH-0000-0000-0000",
    });
    db = error
      ? {
          ok: false,
          latencyMs: Date.now() - t0,
          error: error.code || error.message.slice(0, 60),
        }
      : { ok: true, latencyMs: Date.now() - t0 };
  } catch {
    db = { ok: false, latencyMs: null, error: "unreachable" };
  }

  const body = {
    ok: db.ok,
    service: "novakore-web",
    // Vercel injects the commit; local/dev reports "dev".
    version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev",
    environment: process.env.VERCEL_ENV ?? "local",
    db,
    totalMs: Date.now() - startedAt,
    at: new Date().toISOString(),
  };
  return NextResponse.json(body, { status: db.ok ? 200 : 503 });
}
