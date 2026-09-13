import { describe, expect, test } from "vitest";
import { bareClient, signedIn, type Client } from "./_session";

/**
 * Tenant data portability + erasure (CTO review: contractual requirements).
 *
 * Export is proven against a real seeded tenant. Erasure is proven END TO
 * END on a throwaway organization provisioned inside this suite: content is
 * authored and a lesson version PUBLISHED first, so the delete exercises the
 * one sanctioned path through protect_immutable — a cascade that previously
 * raised 42501 on the first immutable row. The suite is self-cleaning by
 * construction (the throwaway tenant's erasure IS the assertion), with a
 * safety net that erases any residue from a failed earlier run.
 *
 * The new RPCs are not yet in the generated Database types (regenerating
 * needs `npx supabase login`; owner step) — hence the `as never` casts.
 */

const url = process.env.NOVAKORE_TEST_SUPABASE_URL;
const anonKey = process.env.NOVAKORE_TEST_SUPABASE_ANON_KEY;
const configured = Boolean(url && anonKey);

const BETA_ORG = "00000000-0000-4000-8000-000000000104"; // beta-institute (holds the API key rows)
const GAMMA_ORG = "00000000-0000-4000-8000-000000000103"; // gamma-research

const rpc = (
  client: Client,
  fn: string,
  args: Record<string, unknown>,
): Promise<{ data: unknown; error: { code?: string } | null }> =>
  client.rpc(fn as never, args as never) as unknown as Promise<{
    data: unknown;
    error: { code?: string } | null;
  }>;

describe.skipIf(!configured)("tenant export + erasure (real RLS)", () => {
  test("non-admins and anonymous callers are refused both operations", async () => {
    const owner = await signedIn("alpha.owner@novakore.test");
    const anon = bareClient();

    for (const client of [owner, anon]) {
      const exported = await rpc(client, "export_organization_data", {
        p_organization_id: GAMMA_ORG,
      });
      expect(exported.error?.code).toBe("42501");

      const erased = await rpc(client, "delete_organization_data", {
        p_organization_id: GAMMA_ORG,
      });
      expect(erased.error?.code).toBe("42501");
    }
  });

  test("the export carries the whole tenant, identifiable members, and no key material", async () => {
    const admin = await signedIn("platform.admin@novakore.test");
    const { data, error } = await rpc(admin, "export_organization_data", {
      p_organization_id: BETA_ORG,
    });
    expect(error).toBeNull();

    const exported = data as {
      exported_at: string;
      organization: { id: string; slug: string };
      members: { email: string | null; membership_status: string }[];
      tables: Record<string, Record<string, unknown>[]>;
    };
    expect(exported.organization.id).toBe(BETA_ORG);
    expect(exported.members.length).toBeGreaterThan(0);
    expect(exported.members.some((m) => m.email?.includes("@"))).toBe(true);

    // Runtime discovery, not a hand-written list: provisioning tables and a
    // healthy spread of others must be present (empty tables are omitted —
    // an empty array is not data the tenant owns).
    expect(exported.tables["public.organization_memberships"]).toBeDefined();
    expect(Object.keys(exported.tables).length).toBeGreaterThan(5);

    // Secret material never leaves the database. Beta holds real API key
    // rows, so this asserts on actual data, not on an empty set.
    const keys = exported.tables["app.organization_api_keys"];
    expect(keys?.length).toBeGreaterThan(0);
    for (const key of keys!) {
      expect(key).not.toHaveProperty("key_hash");
      expect(key).toHaveProperty("prefix");
    }
  });

  test("erasure is a ceremony: suspension, retyped slug, credential acknowledgment", async () => {
    const admin = await signedIn("platform.admin@novakore.test");

    // Gamma is ACTIVE: a bare call must be a refusing dry run.
    const dry = await rpc(admin, "delete_organization_data", {
      p_organization_id: GAMMA_ORG,
    });
    expect(dry.error).toBeNull();
    const report = dry.data as {
      erased: boolean;
      slug: string;
      blockers: string[];
    };
    expect(report.erased).toBe(false);
    expect(report.slug).toBe("gamma-research");
    expect(report.blockers.join(" ")).toMatch(/not suspended/);
    expect(report.blockers.join(" ")).toMatch(/p_confirm_slug/);

    // And the dry run really was dry.
    const { data: still } = await admin
      .from("organizations")
      .select("id")
      .eq("id", GAMMA_ORG)
      .maybeSingle();
    expect(still?.id).toBe(GAMMA_ORG);
  });

  test("a suspended tenant with published (immutable) content erases end to end", async () => {
    const admin = await signedIn("platform.admin@novakore.test");
    const author = await signedIn("alpha.author@novakore.test");
    const slug = `erasure-lab-${Date.now().toString(36)}`;

    // Residue from a failed earlier run: erase it before creating anew.
    const { data: leftovers } = await admin
      .from("organizations")
      .select("id, slug, status")
      .like("slug", "erasure-lab-%");
    for (const old of leftovers ?? []) {
      if (old.status !== "suspended") {
        await rpc(admin, "set_organization_status", {
          p_organization_id: old.id,
          p_status: "suspended",
        });
      }
      await rpc(admin, "delete_organization_data", {
        p_organization_id: old.id,
        p_confirm_slug: old.slug,
      });
    }

    // Provision with a fixture owner so real authoring can happen inside.
    const provisioned = await rpc(admin, "provision_organization", {
      p_name: "Erasure Lab",
      p_slug: slug,
      p_owner_email: "alpha.author@novakore.test",
    });
    expect(provisioned.error).toBeNull();
    const orgId = provisioned.data as string;

    // Author → publish, so the tenant holds a row protect_immutable guards.
    const { data: course, error: courseError } = await author
      .from("courses")
      .insert({
        organization_id: orgId,
        slug: "doomed",
        title: "Doomed course",
      })
      .select("id")
      .single();
    expect(courseError).toBeNull();
    const { data: module } = await author
      .from("modules")
      .insert({
        organization_id: orgId,
        course_id: course!.id,
        title: "Module",
        position: "a0",
      })
      .select("id")
      .single();
    const { data: lesson } = await author
      .from("lessons")
      .insert({
        organization_id: orgId,
        course_id: course!.id,
        module_id: module!.id,
        title: "Doomed lesson",
        position: "a0",
      })
      .select("id")
      .single();
    await author.from("content_blocks").insert({
      organization_id: orgId,
      lesson_id: lesson!.id,
      block_type: "rich_text",
      schema_version: 1,
      data: { text: "Evidence that immutable rows existed here." },
      position: "a0",
    });
    const published = await author.rpc("publish_lesson", {
      p_lesson_id: lesson!.id,
    });
    expect(published.error).toBeNull();

    const { count: versions } = await author
      .from("lesson_versions")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId);
    expect(versions).toBeGreaterThan(0);

    // Contain, then erase — with the slug retyped.
    await rpc(admin, "set_organization_status", {
      p_organization_id: orgId,
      p_status: "suspended",
    });
    const erased = await rpc(admin, "delete_organization_data", {
      p_organization_id: orgId,
      p_confirm_slug: slug,
    });
    expect(erased.error).toBeNull();
    expect((erased.data as { erased: boolean }).erased).toBe(true);

    // Gone means gone: the organization, and every cascaded row with it.
    const { data: after } = await admin
      .from("organizations")
      .select("id")
      .eq("id", orgId)
      .maybeSingle();
    expect(after).toBeNull();
    const { count: versionsAfter } = await admin
      .from("lesson_versions")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId);
    expect(versionsAfter).toBe(0);
    // (Immutability outside an erasure is already pinned by the isolation
    // suite — "tampering with published evidence" — and RLS ships no DELETE
    // policy anywhere, so no client-side probe could reach the trigger.)
  });
});
