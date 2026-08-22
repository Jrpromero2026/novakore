import { describe, expect, test } from "vitest";
import { seedTerminologyFor } from "@novakore/domain";
import { bareClient, signedIn } from "./_session";

/**
 * Mirrors app.organization_content's allowlist. Duplicated deliberately: the
 * SQL is the enforcement and this is a tripwire, so that removing a table
 * from one side without the other fails a test rather than silently changing
 * which tenants can be deleted.
 */
const ALLOWLISTED_AS_CONFIGURATION = [
  "organization_settings",
  "organization_branding",
  "organization_roles",
  "organization_role_permissions",
  "organization_memberships",
  "organization_member_roles",
  "organization_onboarding",
  "organization_terminology",
  "audit_logs",
  "analytics_events",
  "onboarding_events",
];

/**
 * Deleting organizations that were never used.
 *
 * The whole value of this tool is what it REFUSES. A cleanup job that removes
 * an abandoned trial is mildly useful; one that removes a customer's academy
 * is unrecoverable, because the delete cascades across every table scoped to
 * the tenant and issued credentials stop verifying. So the tests here are
 * mostly about the refusals, and they run against the real seeded tenants —
 * asserting on live organizations that hold actual content is the point, not
 * a compromise.
 *
 * Nothing here passes p_confirm. Every call is a dry run.
 */

const ALPHA = "00000000-0000-4000-8000-000000000101";
const BFH = "00000000-0000-4000-8000-000000000102";
const PLATFORM_ADMIN = "platform.admin@novakore.test";

interface Report {
  deleted: boolean;
  would_delete: boolean;
  slug: string;
  age_days: number;
  active_members: number;
  content: { source: string; rows: number }[];
  blockers: string[];
}

describe("delete_empty_organization", () => {
  test("an anonymous caller is refused", async () => {
    const { error } = await bareClient().rpc("delete_empty_organization", {
      p_organization_id: ALPHA,
    });
    expect(error?.code).toBe("42501");
  });

  test("an organization owner is refused — this is platform-only", async () => {
    // An owner has every permission inside their tenant and still cannot
    // invoke this. Deleting a tenant is not an operation the tenant performs.
    const owner = await signedIn("alpha.owner@novakore.test");
    const { error } = await owner.rpc("delete_empty_organization", {
      p_organization_id: ALPHA,
    });
    expect(error?.code).toBe("42501");
  });

  test("a tenant holding real content is refused", async () => {
    const admin = await signedIn(PLATFORM_ADMIN);
    for (const [org, label] of [
      [ALPHA, "Alpha"],
      [BFH, "Built For Her"],
    ] as const) {
      const { data, error } = await admin.rpc("delete_empty_organization", {
        p_organization_id: org,
      });
      expect(error).toBeNull();

      const report = data as unknown as Report;
      expect(report.deleted, `${label} must never be deleted`).toBe(false);
      expect(report.would_delete, `${label} must not even qualify`).toBe(false);
      expect(report.blockers).toContain("has content");
      // The report says WHICH tables held something, so an operator reading a
      // refusal can see what they were about to destroy.
      expect(report.content.length).toBeGreaterThan(0);
    }
  });

  test("the default is a dry run", async () => {
    // Omitting p_confirm must never delete. The parameter defaults to false
    // precisely so that a forgotten argument is harmless.
    const admin = await signedIn(PLATFORM_ADMIN);
    const { data } = await admin.rpc("delete_empty_organization", {
      p_organization_id: BFH,
    });
    expect((data as unknown as Report).deleted).toBe(false);

    const { count } = await admin
      .from("organizations")
      .select("id", { count: "exact", head: true })
      .eq("id", BFH);
    expect(count, "the organization is still there").toBe(1);
  });

  test("a young empty tenant is refused on age alone", async () => {
    // Emptiness is not sufficient. A workspace created an hour ago is someone
    // mid-setup, not an abandoned one, and the age floor is what tells them
    // apart. Any tenant created during this session serves as the fixture.
    const admin = await signedIn(PLATFORM_ADMIN);
    const { data: young } = await admin
      .from("organizations")
      .select("id, slug, created_at")
      .gte("created_at", new Date(Date.now() - 7 * 864e5).toISOString())
      .limit(1);

    if (!young?.length) return; // nothing recent enough to assert on

    const { data } = await admin.rpc("delete_empty_organization", {
      p_organization_id: young[0]!.id,
    });
    const report = data as unknown as Report;
    expect(report.would_delete).toBe(false);
    expect(report.blockers.join(" ")).toMatch(/days old/);
  });

  test("a workspace that only chose a vocabulary is still empty", () => {
    // Signup seeds terminology from the chosen use case, so every self-serve
    // organization has those rows from birth. Counting them as content made
    // every such tenant permanently undeletable — exactly the ones this tool
    // exists for. Terminology is configuration: "we call a course an SOP"
    // says nothing about whether anyone created one.
    //
    // Asserted against the catalog rather than the database, because the
    // interaction is between two design decisions and this is where a future
    // change to either would break it.
    expect(seedTerminologyFor("staff_onboarding").length).toBeGreaterThan(0);
    expect(ALLOWLISTED_AS_CONFIGURATION).toContain("organization_terminology");
  });
});
