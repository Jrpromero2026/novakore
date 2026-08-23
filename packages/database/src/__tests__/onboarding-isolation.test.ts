import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Database } from "../types/database";

/**
 * Guided-onboarding RLS suite (docs/architecture/onboarding.md §11).
 * Real novakore-dev, real RLS. Confirms:
 *  - onboarding events insert only under the caller's OWN active membership;
 *  - events and lifecycle rows never cross organizations;
 *  - checklist lifecycle (dismiss/restore) writes require org.manage;
 *  - one tenant's completion state cannot be influenced by another tenant.
 */

const url = process.env.NOVAKORE_TEST_SUPABASE_URL;
const anonKey = process.env.NOVAKORE_TEST_SUPABASE_ANON_KEY;
const configured = Boolean(url && anonKey);
const ORG_A = "00000000-0000-4000-8000-000000000101"; // Alpha Learning Collective
const ORG_B = "00000000-0000-4000-8000-000000000104"; // Beta Institute
const DEV_PASSWORD =
  process.env.NOVAKORE_TEST_PASSWORD ?? "NovaKore-dev-password-1";
const runTag = Date.now().toString(36);

type Client = SupabaseClient<Database>;
const clients: Client[] = [];
async function signedIn(email: string): Promise<Client> {
  const client = createClient<Database>(url!, anonKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword({
    email,
    password: DEV_PASSWORD,
  });
  if (error) throw new Error(`sign-in failed for ${email}: ${error.message}`);
  clients.push(client);
  return client;
}

async function membershipId(client: Client, orgId: string): Promise<string> {
  const { data: userData } = await client.auth.getUser();
  const { data } = await client
    .from("organization_memberships")
    .select("id")
    .eq("organization_id", orgId)
    .eq("user_id", userData.user!.id)
    .maybeSingle();
  if (!data) throw new Error("membership fixture missing");
  return data.id;
}

describe.skipIf(!configured)("onboarding RLS", () => {
  let alphaOwner: Client; // org A, holds org.manage
  let alphaLearner: Client; // org A, no org.manage
  let bfhOwner: Client; // org B
  let alphaOwnerMembership: string;
  let alphaLearnerMembership: string;
  let bfhOwnerMembership: string;

  beforeAll(async () => {
    [alphaOwner, alphaLearner, bfhOwner] = await Promise.all([
      signedIn("alpha.owner@novakore.test"),
      signedIn("alpha.learner@novakore.test"),
      signedIn("beta.owner@novakore.test"),
    ]);
    [alphaOwnerMembership, alphaLearnerMembership, bfhOwnerMembership] =
      await Promise.all([
        membershipId(alphaOwner, ORG_A),
        membershipId(alphaLearner, ORG_A),
        membershipId(bfhOwner, ORG_B),
      ]);
  });
  afterAll(async () => {
    await Promise.all(clients.map((c) => c.auth.signOut()));
  });

  // ---- onboarding_events ---------------------------------------------------

  test("a member records an event under their own membership", async () => {
    const { error } = await alphaOwner.from("onboarding_events").insert({
      organization_id: ORG_A,
      membership_id: alphaOwnerMembership,
      event_type: "onboarding.walkthrough.started",
      walkthrough_id: `rls-test-${runTag}`,
    });
    expect(error).toBeNull();
  });

  test("a member cannot record an event under someone else's membership", async () => {
    const { error } = await alphaLearner.from("onboarding_events").insert({
      organization_id: ORG_A,
      membership_id: alphaOwnerMembership,
      event_type: "onboarding.step.completed",
    });
    expect(error).not.toBeNull();
  });

  test("a member cannot record an event into another organization", async () => {
    const { error } = await bfhOwner.from("onboarding_events").insert({
      organization_id: ORG_A,
      membership_id: bfhOwnerMembership,
      event_type: "onboarding.preview.opened",
    });
    expect(error).not.toBeNull();
  });

  test("events are invisible across organizations", async () => {
    const { data } = await bfhOwner
      .from("onboarding_events")
      .select("id")
      .eq("organization_id", ORG_A);
    expect(data ?? []).toHaveLength(0);
  });

  test("org members read their organization's events", async () => {
    const { data, error } = await alphaLearner
      .from("onboarding_events")
      .select("id, walkthrough_id")
      .eq("organization_id", ORG_A)
      .eq("walkthrough_id", `rls-test-${runTag}`);
    expect(error).toBeNull();
    expect((data ?? []).length).toBeGreaterThan(0);
  });

  test("malformed event types are rejected by the check constraint", async () => {
    const { error } = await alphaOwner.from("onboarding_events").insert({
      organization_id: ORG_A,
      membership_id: alphaOwnerMembership,
      event_type: "not-an-onboarding-event",
    });
    expect(error).not.toBeNull();
  });

  // ---- organization_onboarding (lifecycle) --------------------------------

  test("org.manage holder dismisses and restores the checklist", async () => {
    const dismiss = await alphaOwner.from("organization_onboarding").upsert(
      {
        organization_id: ORG_A,
        dismissed_at: new Date().toISOString(),
      },
      { onConflict: "organization_id" },
    );
    expect(dismiss.error).toBeNull();

    const restore = await alphaOwner
      .from("organization_onboarding")
      .update({ dismissed_at: null })
      .eq("organization_id", ORG_A);
    expect(restore.error).toBeNull();
  });

  test("a member without org.manage cannot write lifecycle state", async () => {
    const { error } = await alphaLearner.from("organization_onboarding").upsert(
      {
        organization_id: ORG_A,
        dismissed_at: new Date().toISOString(),
      },
      { onConflict: "organization_id" },
    );
    expect(error).not.toBeNull();
  });

  test("lifecycle state cannot be written for another organization", async () => {
    const { error } = await bfhOwner.from("organization_onboarding").upsert(
      {
        organization_id: ORG_A,
        dismissed_at: new Date().toISOString(),
      },
      { onConflict: "organization_id" },
    );
    expect(error).not.toBeNull();
  });

  test("lifecycle state is invisible across organizations", async () => {
    const { data } = await bfhOwner
      .from("organization_onboarding")
      .select("organization_id")
      .eq("organization_id", ORG_A);
    expect(data ?? []).toHaveLength(0);
  });

  test("another tenant's activity cannot complete this tenant's event steps", async () => {
    // Org B records a preview event for THEIR org; org A's derived
    // completion query (org-scoped) must not see it.
    const insert = await bfhOwner.from("onboarding_events").insert({
      organization_id: ORG_B,
      membership_id: bfhOwnerMembership,
      event_type: "onboarding.preview.opened",
      data: { runTag },
    });
    expect(insert.error).toBeNull();

    const { data } = await alphaOwner
      .from("onboarding_events")
      .select("id")
      .eq("organization_id", ORG_A)
      .eq("event_type", "onboarding.preview.opened")
      .contains("data", { runTag });
    expect(data ?? []).toHaveLength(0);
  });
});
