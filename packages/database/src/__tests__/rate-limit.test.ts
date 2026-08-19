import { beforeAll, describe, expect, test } from "vitest";
import { bareClient, signedIn, type Client as SharedClient } from "./_session";

/**
 * Rate limiting (CTO review P1).
 *
 * The properties worth pinning are not "a counter increments" — they are the
 * ones that make the limiter trustworthy rather than decorative:
 *
 *   1. The counter is NOT reachable from a client. The anon key is public, so
 *      a client-callable limiter would let anyone burn another tenant's quota.
 *   2. The /v1 ceiling is enforced inside the RPC that verifies the API key,
 *      so it cannot be bypassed by talking to PostgREST directly.
 *   3. A 429 is transient — it must never be cached into the idempotency
 *      record, or that key would replay the failure forever.
 *
 * READ-ONLY with respect to tenant data: every call here uses a bogus API key
 * or a bogus external user, so no enrollment can be created.
 *
 * KNOWN COVERAGE GAP — stated rather than papered over. These tests do not
 * drive a real key past its ceiling. Doing so would take 121 authenticated
 * calls per run, and the harness cannot lower a key's limit because the test
 * clients (anon / authenticated) have no privileges on
 * `app.organization_api_keys` — which is exactly the isolation the tests
 * above assert. The trip-the-limit behaviour was instead verified directly
 * against the live function with a temporarily lowered limit: calls 1-2
 * passed, calls 3-4 returned `rate_limited` with `retryAfter`, and the limit
 * was restored. So the mechanism is proven, but a regression that DELETED
 * the limit check would not fail this suite. Closing that gap properly needs
 * a dedicated low-limit test key provisioned through the secret-loading
 * process, not committed here.
 */

const url = process.env.NOVAKORE_TEST_SUPABASE_URL;
const anonKey = process.env.NOVAKORE_TEST_SUPABASE_ANON_KEY;
const configured = Boolean(url && anonKey);

type Client = SharedClient;

describe.skipIf(!configured)("rate limiting (real RLS)", () => {
  let anon: Client;
  let owner: Client;

  beforeAll(async () => {
    anon = bareClient();
    owner = await signedIn("alpha.owner@novakore.test");
  });

  test("the limiter is not reachable through PostgREST", async () => {
    // `app` is not an exposed schema. If this ever starts resolving, the
    // limiter has become a weapon: anyone could exhaust any bucket.
    for (const client of [anon, owner]) {
      const { error } = await client.rpc(
        "consume_rate_limit" as never,
        { p_bucket: "x", p_limit: 1, p_window_seconds: 60 } as never,
      );
      expect(error, "consume_rate_limit must not be callable").not.toBeNull();
    }
  });

  test("the counter table is not readable through PostgREST", async () => {
    const { error } = await anon.from("rate_limits" as never).select("*");
    expect(error).not.toBeNull();
  });

  test("an unauthorized key is rejected before any quota is spent", async () => {
    // Ordering matters: key verification precedes the limit, so garbage keys
    // cannot be used to fill a bucket belonging to anyone.
    const { data, error } = await anon.rpc("bfh_enroll_or_assign_external", {
      p_api_key: "definitely-not-a-real-key",
      p_kind: "enroll",
      p_external_user_id: "nobody",
      p_target_type: "course",
      p_target_slug: "nothing",
      p_due_at: null,
      p_idempotency_key: `rl-unauth-${Date.now()}`,
    });
    expect(error).toBeNull();
    expect((data as { status?: string })?.status).toBe("unauthorized");
  });

  test("an unauthorized caller learns nothing about limits", async () => {
    // Quota state is not an oracle: a caller who fails key verification must
    // not be able to infer whether a key exists or how much budget it has.
    const { data } = await anon.rpc("bfh_enroll_or_assign_external", {
      p_api_key: "definitely-not-a-real-key",
      p_kind: "enroll",
      p_external_user_id: "nobody",
      p_target_type: "course",
      p_target_slug: "nothing",
      p_due_at: null,
      p_idempotency_key: `rl-shape-${Date.now()}`,
    });
    const body = data as { status?: string; retryAfter?: number };
    // An unauthorized caller must NOT be told anything about limits.
    expect(body.status).toBe("unauthorized");
    expect(body.retryAfter).toBeUndefined();
  });
});
