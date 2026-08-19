import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { publicEnv } from "@novakore/database";
import { cached } from "@/lib/cache";

export const dynamic = "force-dynamic";

/**
 * Operational health endpoint (Phase 6 — observability).
 *
 * Anonymous by design and safe by construction: it reports reachability and
 * latency, never data. The database probe runs as `anon` under full RLS —
 * a successful empty read proves PostgREST + Postgres + RLS are alive
 * without exposing a single row.
 *
 * The probe result is reused for a few seconds. This endpoint is anonymous
 * and cannot be rate limited at the database
 * layer — the caller supplies everything Postgres can see, so any bucket
 * would be forgeable (see docs/architecture/SCALABILITY_PLAN.md). What CAN
 * be removed is the incentive: collapsing repeated probes to one database
 * round trip per window means flooding this route costs an attacker far more
 * than it costs the platform. That is load shedding, not access control, and
 * a per-instance cache is adequate precisely because no security boundary
 * depends on it.
 *
 * Five seconds is short enough that a real outage still surfaces promptly to
 * a monitor polling every 30-60s.
 */
const PROBE_TTL_MS = 5_000;

export async function GET() {
  const startedAt = Date.now();
  const env = publicEnv();

  const db = await cached("health:db-probe", PROBE_TTL_MS, async () =>
    probeDb(env),
  );

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

async function probeDb(
  env: ReturnType<typeof publicEnv>,
): Promise<{ ok: boolean; latencyMs: number | null; error?: string }> {
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
  return db;
}
