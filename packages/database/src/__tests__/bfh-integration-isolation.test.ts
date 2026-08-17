import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, test } from "vitest";

/**
 * BFH integration isolation + failure-mode suite (Validation phase). Real
 * novakore-dev database, real RLS/grants, real RPCs — zero mocks. Confirms:
 * the app-schema integration tables are not exposed to the public API; the
 * SSO exchange is service_role-only (never anon-reachable); and the API-key-
 * gated enrollment RPC rejects bad keys, cross-audience, and unknown targets.
 *
 * The full signature/timing/nonce matrix is exercised in SQL (documented in
 * docs/integrations/built-for-her/phase-alpha-validation.md) because the
 * exchange is service_role-only and cannot be called by this anon client.
 */

const url = process.env.NOVAKORE_TEST_SUPABASE_URL;
const anonKey = process.env.NOVAKORE_TEST_SUPABASE_ANON_KEY;
const configured = Boolean(url && anonKey);

// Dev-only integration key (seeded into novakore-dev); overridable by env.
const BFH_KEY =
  process.env.NOVAKORE_TEST_BFH_API_KEY ??
  "nvk_bfhdev_ZH9x2Qm7Kp4tR8vW3nB6sL1cY0aE5dF";

const runTag = Date.now().toString(36);

const DEV_PASSWORD =
  process.env.NOVAKORE_TEST_PASSWORD ?? "NovaKore-dev-password-1";

/** Untyped anon client — the new integration RPCs are not in the generated types. */
function anon(): SupabaseClient {
  return createClient(url!, anonKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const signedClients: SupabaseClient[] = [];
async function signedIn(email: string): Promise<SupabaseClient> {
  const client = anon();
  const { error } = await client.auth.signInWithPassword({
    email,
    password: DEV_PASSWORD,
  });
  if (error) throw new Error(`sign-in failed for ${email}: ${error.message}`);
  signedClients.push(client);
  return client;
}

describe.skipIf(!configured)("BFH integration isolation (real RLS)", () => {
  test("app-schema integration tables are not exposed to the public API", async () => {
    const client = anon();
    for (const table of [
      "external_identities",
      "organization_api_keys",
      "bfh_integration_config",
    ]) {
      const { error } = await client.from(table).select("*").limit(1);
      // Not in the public API surface → PostgREST rejects the relation.
      expect(error).not.toBeNull();
    }
  });

  test("the SSO exchange is service_role-only (anon cannot execute it)", async () => {
    const { error } = await anon().rpc("bfh_exchange_handoff", {
      p_organization_slug: "bfh-dev",
      p_external_user_id: "attacker",
      p_email: "attacker@example.com",
      p_display_name: null,
      p_access_level: "admin",
      p_audiences: ["member"],
      p_issued_at: Math.floor(Date.now() / 1000),
      p_expires_at: Math.floor(Date.now() / 1000) + 60,
      p_nonce: `atk-${runTag}`,
      p_signature: "x",
    });
    expect(error).not.toBeNull();
  });

  test("enrollment API rejects an invalid bearer key", async () => {
    const { data } = await anon().rpc("bfh_enroll_or_assign_external", {
      p_api_key: "totally-wrong-key",
      p_kind: "assign",
      p_external_user_id: "bfh-member-alpha",
      p_target_type: "learning_path",
      p_target_slug: "strong-foundations",
      p_due_at: null,
      p_idempotency_key: `bad-${runTag}`,
    });
    expect((data as { status?: string })?.status).toBe("unauthorized");
  });

  test("audience gate: a member cannot be assigned coach-certification content", async () => {
    const { data } = await anon().rpc("bfh_enroll_or_assign_external", {
      p_api_key: BFH_KEY,
      p_kind: "assign",
      p_external_user_id: "bfh-member-alpha",
      p_target_type: "learning_path",
      p_target_slug: "coach-certification-journey",
      p_due_at: null,
      p_idempotency_key: `aud-${runTag}`,
    });
    const result = data as { status?: string; code?: string };
    expect(result?.status).toBe("forbidden");
    expect(result?.code).toBe("audience_mismatch");
  });

  test("enrollment API returns not_found for an unknown external user", async () => {
    const { data } = await anon().rpc("bfh_enroll_or_assign_external", {
      p_api_key: BFH_KEY,
      p_kind: "assign",
      p_external_user_id: `ghost-${runTag}`,
      p_target_type: "learning_path",
      p_target_slug: "strong-foundations",
      p_due_at: null,
      p_idempotency_key: `ghost-${runTag}`,
    });
    const result = data as { status?: string; code?: string };
    expect(result?.status).toBe("not_found");
    expect(result?.code).toBe("unknown_external_user");
  });

  test("a revoked external identity cannot be enrolled; restore re-enables", async () => {
    const admin = await signedIn("bfh.owner@novakore.test"); // integrations.manage
    // revoke the coach mapping
    const { data: rev } = await admin.rpc("bfh_set_external_identity_status", {
      p_organization_slug: "bfh-dev",
      p_external_user_id: "bfh-coach-alpha",
      p_status: "revoked",
    });
    expect((rev as { status?: string })?.status).toBe("revoked");
    try {
      const { data } = await anon().rpc("bfh_enroll_or_assign_external", {
        p_api_key: BFH_KEY,
        p_kind: "assign",
        p_external_user_id: "bfh-coach-alpha",
        p_target_type: "learning_path",
        p_target_slug: "coach-certification-journey",
        p_due_at: null,
        p_idempotency_key: `revoked-${runTag}`,
      });
      const result = data as { status?: string; code?: string };
      expect(result?.status).toBe("forbidden");
      expect(result?.code).toBe("identity_revoked");
    } finally {
      // always restore so shared QA data is not left revoked
      await admin.rpc("bfh_set_external_identity_status", {
        p_organization_slug: "bfh-dev",
        p_external_user_id: "bfh-coach-alpha",
        p_status: "active",
      });
    }
  });

  test("a member (no integrations.manage) cannot revoke a mapping", async () => {
    const member = await signedIn("bfh.member@novakore.test");
    const { data } = await member.rpc("bfh_set_external_identity_status", {
      p_organization_slug: "bfh-dev",
      p_external_user_id: "bfh-coach-alpha",
      p_status: "revoked",
    });
    expect((data as { status?: string })?.status).toBe("forbidden");
  });

  afterAll(async () => {
    await Promise.all(signedClients.map((c) => c.auth.signOut()));
  });
});
