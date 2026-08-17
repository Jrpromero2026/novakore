import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, test } from "vitest";

/**
 * Platform tenant-operations gating (Phase 6, Priority 8), proven against
 * the live database under real RLS sessions:
 *  - organization members (even owners) get `forbidden` from every operator
 *    function;
 *  - the platform administrator gets real diagnostics and a reversible
 *    suspend → reactivate cycle (restored in finally).
 */

const url = process.env.NOVAKORE_TEST_SUPABASE_URL!;
const anonKey = process.env.NOVAKORE_TEST_SUPABASE_ANON_KEY!;
const DEV_PASSWORD =
  process.env.NOVAKORE_TEST_PASSWORD ?? "NovaKore-dev-password-1";
const GAMMA_ORG = "00000000-0000-4000-8000-000000000103";

const clients: SupabaseClient[] = [];

async function signedIn(email: string): Promise<SupabaseClient> {
  const client = createClient(url, anonKey, {
    auth: { persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword({
    email,
    password: DEV_PASSWORD,
  });
  if (error) throw new Error(`sign-in failed for ${email}: ${error.message}`);
  clients.push(client);
  return client;
}

afterAll(async () => {
  await Promise.all(clients.map((c) => c.auth.signOut()));
});

describe("platform tenant operations", () => {
  test("an organization owner is forbidden from every operator function", async () => {
    const owner = await signedIn("alpha.owner@novakore.test");

    // Canonical Phase-1A provisioning fn raises 42501 for non-platform-admins.
    const provision = await owner.rpc("provision_organization", {
      p_name: "Should Not Exist",
      p_slug: "should-not-exist",
      p_owner_email: "nobody@novakore.test",
    });
    expect(provision.error?.code).toBe("42501");

    const diag = await owner.rpc("tenant_diagnostics", {
      p_organization_id: GAMMA_ORG,
    });
    expect((diag.data as { status: string }).status).toBe("forbidden");

    const status = await owner.rpc("set_organization_status", {
      p_organization_id: GAMMA_ORG,
      p_status: "suspended",
    });
    expect((status.data as { status: string }).status).toBe("forbidden");
  });

  test("the platform administrator gets real diagnostics", async () => {
    const admin = await signedIn("platform.admin@novakore.test");
    const { data, error } = await admin.rpc("tenant_diagnostics", {
      p_organization_id: GAMMA_ORG,
    });
    expect(error).toBeNull();
    const diag = data as {
      status: string;
      organization: { slug: string; org_status: string };
      members_active: number;
    };
    expect(diag.status).toBe("ok");
    expect(diag.organization.slug).toBe("gamma-research");
    expect(diag.members_active).toBeGreaterThanOrEqual(1);
  });

  test("suspend → reactivate is reversible and archived is unreachable", async () => {
    const admin = await signedIn("platform.admin@novakore.test");
    try {
      const suspend = await admin.rpc("set_organization_status", {
        p_organization_id: GAMMA_ORG,
        p_status: "suspended",
      });
      expect(suspend.error).toBeNull();
      expect((suspend.data as { status: string }).status).toBe("ok");

      const archived = await admin.rpc("set_organization_status", {
        p_organization_id: GAMMA_ORG,
        p_status: "archived",
      });
      expect(archived.error).toBeNull();
      expect((archived.data as { status: string }).status).toBe("invalid");
    } finally {
      const restore = await admin.rpc("set_organization_status", {
        p_organization_id: GAMMA_ORG,
        p_status: "active",
      });
      expect(restore.error).toBeNull();
      expect((restore.data as { status: string }).status).toBe("ok");
    }
  });
});
