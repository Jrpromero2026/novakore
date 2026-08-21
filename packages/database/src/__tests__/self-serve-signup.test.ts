import { afterAll, describe, expect, test } from "vitest";
import { bareClient, signedIn } from "./_session";

/**
 * Self-serve organization creation.
 *
 * The rule that matters: `create_own_organization` takes no parameter for
 * WHOSE organization it is. It can only ever create one owned by the caller,
 * which is what makes it safe to expose to anybody with an account, unlike
 * `provision_organization` — that one names an owner and stays platform-only.
 *
 * Organizations cannot be deleted (a trigger protects system roles, and
 * removal is permanent history), so every organization these tests create is
 * archived rather than dropped, and named so it is obviously not real.
 *
 * Two constraints shape how little this file creates.
 *
 * Creation is rate limited to 5 per user per hour, and organizations are
 * permanent, so every run leaves rows behind for good. So: one creation per
 * test, each from a different account, and collisions proven against a slug
 * that already exists rather than by making two organizations to collide with
 * each other. Two per run, archived afterwards.
 */

const created: { slug: string; account: string }[] = [];

afterAll(async () => {
  for (const { slug, account } of created) {
    const client = await signedIn(account);
    await client
      .from("organizations")
      .update({ status: "archived", name: "ARCHIVED test fixture" })
      .eq("slug", slug);
  }
});

describe("create_own_organization", () => {
  test("an anonymous caller is refused", async () => {
    const { error } = await bareClient().rpc("create_own_organization", {
      p_name: "Should Not Exist",
    });
    expect(error, "anonymous creation must be refused").not.toBeNull();
    expect(error?.code).toBe("42501");
  });

  test("a signed-in caller becomes the owner of what they create", async () => {
    const account = "alpha.learner@novakore.test";
    const client = await signedIn(account);
    const name = `Self Serve Test ${Date.now().toString(36)}`;

    const { data, error } = await client.rpc("create_own_organization", {
      p_name: name,
      p_use_case: "coaching",
    });
    expect(error).toBeNull();

    const row = data?.[0];
    expect(row?.slug, "a slug is derived from the name").toBeTruthy();
    created.push({ slug: row!.slug, account });

    // Derived, not supplied: the person types a name, not a URL.
    expect(row!.slug).toMatch(/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/);
    expect(row!.slug).not.toMatch(/--/);

    // Owner, active, immediately — not an invitation to themselves.
    const { data: membership } = await client
      .from("organization_memberships")
      .select("status, organization_member_roles(organization_roles(key))")
      .eq("organization_id", row!.organization_id)
      .single();
    expect(membership?.status).toBe("active");
    expect(
      membership?.organization_member_roles?.[0]?.organization_roles?.key,
    ).toBe("organization_owner");

    // A usable workspace, not a bare row: the full role set is seeded.
    const { count } = await client
      .from("organization_roles")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", row!.organization_id);
    expect(count, "system roles are seeded").toBe(9);
  });

  test("a name whose slug is already taken gets a distinct one", async () => {
    const account = "alpha.reviewer@novakore.test";
    const client = await signedIn(account);

    // "Alpha Learning Collective" slugifies onto the seeded tenant's slug, so
    // one creation proves the collision path — the earlier version created
    // two organizations to prove the same thing, and every organization these
    // tests make is permanent.
    const { data, error } = await client.rpc("create_own_organization", {
      p_name: "Alpha Learning Collective",
    });
    expect(error).toBeNull();

    const slug = data![0]!.slug;
    created.push({ slug, account });
    expect(slug).not.toBe("alpha-learning");
    expect(slug).toMatch(/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/);
    expect(slug).not.toMatch(/--/);
  });
});
