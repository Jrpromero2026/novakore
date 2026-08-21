import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { signedIn, userIdFor, type Client as SharedClient } from "./_session";
import type { Database } from "../types/database";

/**
 * Internal-alpha operations RLS suite. Real novakore-dev, real RLS. Confirms
 * any active member can file feedback for their OWN membership (not another's),
 * reviewers (analytics.view) can read org feedback, and tester cohorts are
 * reviewer-only.
 */

const url = process.env.NOVAKORE_TEST_SUPABASE_URL;
const anonKey = process.env.NOVAKORE_TEST_SUPABASE_ANON_KEY;
const configured = Boolean(url && anonKey);
const ORG_B = "00000000-0000-4000-8000-000000000102"; // builtforher
const runTag = Date.now().toString(36);

// Sessions come from the suite-wide pool (vitest.globalSetup.ts).
type Client = SharedClient;

describe.skipIf(!configured)("alpha operations RLS", () => {
  let member: Client;
  let admin: Client;
  let memberMembershipId: string;
  let ownerMembershipId: string;

  beforeAll(async () => {
    [member, admin] = await Promise.all([
      signedIn("bfh.member@novakore.test"),
      signedIn("bfh.owner@novakore.test"),
    ]);
    // Pooled clients carry a bearer token and hold no local session, so the
    // user id comes from the pool rather than `auth.getUser()`.
    const [memberUserId, ownerUserId] = await Promise.all([
      userIdFor("bfh.member@novakore.test"),
      userIdFor("bfh.owner@novakore.test"),
    ]);
    const { data: ms } = await member
      .from("organization_memberships")
      .select("id")
      .eq("organization_id", ORG_B)
      .eq("user_id", memberUserId)
      .maybeSingle();
    memberMembershipId = ms!.id;
    const { data: os } = await admin
      .from("organization_memberships")
      .select("id")
      .eq("organization_id", ORG_B)
      .eq("user_id", ownerUserId)
      .maybeSingle();
    ownerMembershipId = os!.id;
  });

  test("a member can file feedback for their own membership", async () => {
    const { error } = await member.from("feedback").insert({
      organization_id: ORG_B,
      membership_id: memberMembershipId,
      category: "usability",
      message: `member self test ${runTag}`,
      context: { route: "/builtforher/learn", roleHint: "member" },
    });
    expect(error).toBeNull();
  });

  test("a member cannot file feedback under another member's id", async () => {
    const { error } = await member.from("feedback").insert({
      organization_id: ORG_B,
      membership_id: ownerMembershipId,
      category: "bug",
      message: `spoofed ${runTag}`,
      context: {},
    });
    expect(error).not.toBeNull();
  });

  test("a reviewer (analytics.view) reads org feedback", async () => {
    const { data, error } = await admin
      .from("feedback")
      .select("id, message")
      .eq("organization_id", ORG_B)
      .ilike("message", `member self test ${runTag}`);
    expect(error).toBeNull();
    expect((data ?? []).length).toBeGreaterThan(0);
  });

  test("tester cohorts are reviewer-only", async () => {
    const { data: adminView } = await admin
      .from("tester_labels")
      .select("label")
      .eq("organization_id", ORG_B);
    expect((adminView ?? []).length).toBeGreaterThan(0);

    const { data: memberView } = await member
      .from("tester_labels")
      .select("label")
      .eq("organization_id", ORG_B);
    expect(memberView ?? []).toHaveLength(0);
  });
});
