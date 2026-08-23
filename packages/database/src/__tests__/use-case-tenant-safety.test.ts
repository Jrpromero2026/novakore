import { describe, expect, test } from "vitest";
import { USE_CASE_IDS } from "@novakore/domain";
import { signedIn } from "./_session";

/**
 * Existing organizations are not disturbed by use-case terminology.
 *
 * organization_terminology records no provenance: a row seeded at signup and
 * a word a customer typed on the terminology screen are byte-for-byte
 * indistinguishable. So corrected vocabulary is applied to NEW organizations
 * only, and nothing ever re-seeds an existing one. This fails closed by
 * construction rather than by judgement, because guessing wrong overwrites a
 * customer's own words with no way back.
 *
 * Beta Institute is the shape that matters: seven overrides chosen before use
 * cases existed, on a tenant with no use_case at all. It carries a copy of the
 * vocabulary the first real customer authored, so the invariant is proven
 * against a fixture rather than by reading a live tenant's data.
 */

const ORG_WITH_PRIOR_TERMS = "00000000-0000-4000-8000-000000000104";
const PLATFORM_ADMIN = "platform.admin@novakore.test";

describe("existing tenants are protected from use-case seeding", () => {
  test("a tenant keeps vocabulary it authored before use cases existed", async () => {
    const owner = await signedIn("beta.owner@novakore.test");
    const { data } = await owner
      .from("organization_terminology")
      .select("term_key, singular")
      .eq("organization_id", ORG_WITH_PRIOR_TERMS)
      .order("term_key");

    const terms = Object.fromEntries(
      (data ?? []).map((r) => [r.term_key, r.singular]),
    );

    // Pinned literally. These were authored for this tenant, not seeded, and
    // several collide with words a use case would have chosen — "Program" is
    // what customer_academy seeds, "Coach" is what coaching seeds. If a future
    // change ever re-seeds existing organizations, this is what it destroys.
    expect(terms).toEqual({
      assessment: "Evaluation",
      certificate: "Credential",
      course: "Program",
      instructor: "Coach",
      learner: "Member",
      learning_path: "Journey",
      module: "Phase",
    });
  });

  test("an organization with no use case is left entirely alone", async () => {
    const admin = await signedIn(PLATFORM_ADMIN);
    const { data } = await admin
      .from("organizations")
      .select("slug, use_case")
      .eq("id", ORG_WITH_PRIOR_TERMS)
      .single();
    // Never backfilled. Inferring a use case for an existing tenant would be a
    // guess, and the only thing it would earn is the right to overwrite words.
    expect(data?.use_case).toBeNull();
  });

  test("every use case already stored remains valid", async () => {
    // Backwards compatibility, checked against the database rather than
    // assumed: widening the catalog must never strand a row written under the
    // previous list.
    const admin = await signedIn(PLATFORM_ADMIN);
    const { data } = await admin
      .from("organizations")
      .select("slug, use_case")
      .not("use_case", "is", null);

    for (const row of data ?? []) {
      expect(
        USE_CASE_IDS as readonly string[],
        `${row.slug} holds an unknown use case`,
      ).toContain(row.use_case);
    }
  });
});
