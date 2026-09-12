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
 * CEILING COVERAGE (closes the CTO-review gap): a dedicated LOW-limit key
 * (prefix nvk_rlt0, rate_limit_per_minute = 3, dev database only) is
 * provisioned out-of-band and supplied through the same secret-loading
 * process as the fixture password — `NOVAKORE_TEST_RL_KEY` in the gitignored
 * .env.test.local. The plaintext is never committed. The ceiling test drives
 * that key past its limit with a bogus external user, so the only rows it
 * ever touches are the limiter counter and the key's own last_used_at.
 * Re-provisioning after a db reset (any admin SQL path):
 *   insert into app.organization_api_keys
 *     (organization_id, name, prefix, key_hash, scopes, status, rate_limit_per_minute)
 *   values ('<bfh org id>', 'Rate-limit ceiling test key', 'nvk_rlt0',
 *           app.bfh_hash_key('<new secret>'), '{enroll}', 'active', 3);
 * The test skips (does not silently pass) when the env var is absent.
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

  const rlKey = process.env.NOVAKORE_TEST_RL_KEY;

  test.skipIf(!rlKey)(
    "a key past its ceiling is refused with retryAfter, and the 429 is not cached",
    async () => {
      // The key's limit is 3/minute. The bucket may carry residue from a
      // recent run (60s window), so the property asserted is: within
      // limit+1 calls the limiter MUST trip, and once tripped it stays
      // tripped for an immediate retry. Every call uses an unknown external
      // user, so a call that passes the limiter returns not_found and
      // writes no tenant data.
      const limit = 3;
      const seen: string[] = [];
      let limited: {
        retryAfter?: number;
        limit?: number;
        replayed?: boolean;
      } | null = null;
      const idem = `rl-ceiling-${Date.now()}`;

      for (let i = 0; i <= limit; i++) {
        const { data, error } = await anon.rpc(
          "bfh_enroll_or_assign_external",
          {
            p_api_key: rlKey!,
            p_kind: "enroll",
            p_external_user_id: "nobody-ceiling",
            p_target_type: "course",
            p_target_slug: "nothing",
            p_due_at: null,
            p_idempotency_key: `${idem}-${i}`,
          },
        );
        expect(error).toBeNull();
        const body = data as {
          status?: string;
          retryAfter?: number;
          limit?: number;
          replayed?: boolean;
        };
        seen.push(body.status ?? "?");
        if (body.status === "rate_limited") {
          limited = body;
          break;
        }
        // Under the ceiling the bogus user is the terminal condition.
        expect(body.status).toBe("not_found");
      }

      expect(
        limited,
        `limiter never tripped (statuses: ${seen.join(", ")})`,
      ).not.toBeNull();
      expect(limited!.retryAfter).toBeGreaterThan(0);
      expect(limited!.retryAfter).toBeLessThanOrEqual(60);
      expect(limited!.limit).toBe(limit);
      // A 429 must never come back as an idempotency replay.
      expect(limited!.replayed).toBeUndefined();

      // Once tripped, an immediate retry (same idempotency key) is limited
      // again — and still not served from the idempotency store.
      const { data: again } = await anon.rpc("bfh_enroll_or_assign_external", {
        p_api_key: rlKey!,
        p_kind: "enroll",
        p_external_user_id: "nobody-ceiling",
        p_target_type: "course",
        p_target_slug: "nothing",
        p_due_at: null,
        p_idempotency_key: `${idem}-${seen.length - 1}`,
      });
      const retry = again as { status?: string; replayed?: boolean };
      expect(retry.status).toBe("rate_limited");
      expect(retry.replayed).toBeUndefined();
    },
  );

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
