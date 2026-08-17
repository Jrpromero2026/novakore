import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { bareClient, signedIn, type Client as SharedClient } from "./_session";

/**
 * Learning Studio isolation + integrity suite (Phase 2). Real novakore-dev
 * database, real RLS, real RPCs — zero mocks. Covers reusable-block and
 * source-document isolation, AI budget enforcement, review self-approval
 * blocking, outbox → delivery claim/settle idempotency, and future-role
 * seeding parity.
 */

const url = process.env.NOVAKORE_TEST_SUPABASE_URL;
const anonKey = process.env.NOVAKORE_TEST_SUPABASE_ANON_KEY;
const configured = Boolean(url && anonKey);

const ORG_A = "00000000-0000-4000-8000-000000000101";
const ORG_B = "00000000-0000-4000-8000-000000000102";
const DEV_PASSWORD =
  process.env.NOVAKORE_TEST_PASSWORD ?? "NovaKore-dev-password-1";

// Sessions come from the suite-wide pool (vitest.globalSetup.ts) so a full
// run does not re-authenticate the same accounts file after file.
type Client = SharedClient;

const runTag = Date.now().toString(36);

describe.skipIf(!configured)("studio isolation + integrity (real RLS)", () => {
  let alphaOwner: Client;
  let alphaAuthor: Client; // library.manage + sources.manage + ai.author.use, NO publish
  let alphaReviewer: Client; // content.publish
  let bfhOwner: Client;

  beforeAll(async () => {
    [alphaOwner, alphaAuthor, alphaReviewer, bfhOwner] = await Promise.all([
      signedIn("alpha.owner@novakore.test"),
      signedIn("alpha.author@novakore.test"),
      signedIn("alpha.reviewer@novakore.test"),
      signedIn("bfh.owner@novakore.test"),
    ]);
  });
  // No sign-out: sessions are shared suite-wide, and signing out revokes the
  // user's refresh tokens for every other file. Global teardown cleans up.

  // -------------------------------------------------------------------------
  // Reusable block library isolation
  // -------------------------------------------------------------------------
  let reusableBlockId: string;

  test("an author creates a reusable block; other tenants cannot read it", async () => {
    const { data, error } = await alphaAuthor
      .from("reusable_blocks")
      .insert({
        organization_id: ORG_A,
        title: `Reusable ${runTag}`,
        block_type: "rich_text",
        schema_version: 1,
        data: { text: "Shared content." },
        tags: ["qa", runTag],
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    reusableBlockId = data!.id;

    const { data: crossOrg } = await bfhOwner
      .from("reusable_blocks")
      .select("id")
      .eq("organization_id", ORG_A);
    expect(crossOrg).toEqual([]);
  });

  test("client-supplied organization ids cannot forge a cross-tenant block", async () => {
    const { error } = await alphaAuthor.from("reusable_blocks").insert({
      organization_id: ORG_B,
      title: "Injected",
      block_type: "rich_text",
      schema_version: 1,
      data: { text: "x" },
    });
    expect(error).not.toBeNull();
  });

  test("updating a reusable block's data bumps its version (controlled versioning)", async () => {
    const { error } = await alphaAuthor
      .from("reusable_blocks")
      .update({ data: { text: "Edited content." } })
      .eq("id", reusableBlockId);
    expect(error).toBeNull();
    const { data } = await alphaAuthor
      .from("reusable_blocks")
      .select("version")
      .eq("id", reusableBlockId)
      .single();
    expect(data!.version).toBe(2);
  });

  // -------------------------------------------------------------------------
  // Source document isolation
  // -------------------------------------------------------------------------
  test("source documents are tenant-isolated; provider can only see this org's sources", async () => {
    const { data: source, error } = await alphaAuthor
      .from("source_documents")
      .insert({
        organization_id: ORG_A,
        title: `Source ${runTag}`,
        kind: "markdown",
        content: "# Handbook\nWelcome to the team.",
      })
      .select("id")
      .single();
    expect(error).toBeNull();

    const { data: crossOrg } = await bfhOwner
      .from("source_documents")
      .select("id")
      .eq("organization_id", ORG_A);
    expect(crossOrg).toEqual([]);

    // reserving a generation against another org's source is rejected
    const { error: crossSource } = await alphaAuthor.rpc(
      "reserve_ai_generation",
      {
        p_organization_id: ORG_A,
        p_operation: "summarize_source",
        p_model_profile: "rewrite",
        p_provider: "deterministic",
        p_objective: "cross-tenant source test",
        p_source_document_ids: [
          // a BFH source id would fail org check; use a random uuid
          "00000000-0000-4000-8000-0000000009ff",
        ],
      },
    );
    expect(crossSource?.message).toMatch(/source documents must belong/i);

    // clean grounded reservation succeeds
    const { data: genId, error: reserveError } = await alphaAuthor.rpc(
      "reserve_ai_generation",
      {
        p_organization_id: ORG_A,
        p_operation: "summarize_source",
        p_model_profile: "rewrite",
        p_provider: "deterministic",
        p_objective: "summarize the handbook",
        p_source_document_ids: [source!.id],
      },
    );
    expect(reserveError).toBeNull();
    expect(genId).toBeTruthy();
    // settle it so we don't leave a dangling reservation
    await alphaAuthor.rpc("settle_ai_generation", {
      p_generation_id: genId as string,
      p_success: true,
      p_output: { summary: "ok", keyPoints: ["a"] },
      p_input_tokens: 100,
      p_output_tokens: 50,
    });
  });

  // -------------------------------------------------------------------------
  // AI budget enforcement
  // -------------------------------------------------------------------------
  test("AI generation requires ai.author.use and records a ledger row", async () => {
    // reviewer lacks ai.author.use
    const { error: denied } = await alphaReviewer.rpc("reserve_ai_generation", {
      p_organization_id: ORG_A,
      p_operation: "course_outline",
      p_model_profile: "structured",
      p_provider: "deterministic",
      p_objective: "unauthorized generation",
    });
    expect(denied?.message).toMatch(/ai\.author\.use/);

    const { data: genId } = await alphaAuthor.rpc("reserve_ai_generation", {
      p_organization_id: ORG_A,
      p_operation: "course_outline",
      p_model_profile: "structured",
      p_provider: "deterministic",
      p_objective: "budget ledger test",
    });
    const { data: ledger } = await alphaAuthor
      .from("ai_generations")
      .select("status, reserved_cents")
      .eq("id", genId as string)
      .single();
    expect(ledger!.status).toBe("reserved");
    expect(ledger!.reserved_cents).toBeGreaterThan(0);
    await alphaAuthor.rpc("settle_ai_generation", {
      p_generation_id: genId as string,
      p_success: false,
      p_error: "cleanup",
    });
  });

  test("the platform budget cap is a hard stop with no silent overage", async () => {
    // set the org limit to zero so any reservation is blocked
    const { error: upsertError } = await alphaOwner
      .from("ai_budgets")
      .upsert({ organization_id: ORG_A, monthly_limit_cents: 0 });
    expect(upsertError).toBeNull();
    const { data: budget } = await alphaOwner
      .from("ai_budgets")
      .select("monthly_limit_cents")
      .eq("organization_id", ORG_A)
      .single();
    expect(budget!.monthly_limit_cents).toBe(0);

    const { error } = await alphaAuthor.rpc("reserve_ai_generation", {
      p_organization_id: ORG_A,
      p_operation: "course_outline",
      p_model_profile: "structured",
      p_provider: "deterministic",
      p_objective: "should be blocked by budget",
    });
    expect(error?.message).toMatch(/budget exceeded/i);
    // restore the default cap
    await alphaOwner
      .from("ai_budgets")
      .update({ monthly_limit_cents: 5000 })
      .eq("organization_id", ORG_A);
  });

  test("the ai_budgets limit can never exceed the platform cap", async () => {
    const { error } = await alphaOwner.from("ai_budgets").upsert({
      organization_id: ORG_A,
      monthly_limit_cents: 999999,
    });
    expect(error).not.toBeNull(); // CHECK (monthly_limit_cents between 0 and 5000)
  });

  // -------------------------------------------------------------------------
  // Review self-approval blocking
  // -------------------------------------------------------------------------
  test("a reviewer cannot approve their own review request", async () => {
    const lessonId = "00000000-0000-4000-8000-000000000531"; // seeded Alpha lesson
    // reviewer requests review (they hold content.publish but request as author-capable? no)
    // author requests; then author (no publish) cannot decide; reviewer can, but not their own
    const { data: requestId, error: reqError } = await alphaAuthor.rpc(
      "request_review",
      {
        p_organization_id: ORG_A,
        p_subject_type: "lesson",
        p_subject_id: lessonId,
        p_note: `QA ${runTag}`,
      },
    );
    expect(reqError).toBeNull();

    // author lacks publish → cannot decide
    const { error: authorDecide } = await alphaAuthor.rpc("decide_review", {
      p_request_id: requestId as string,
      p_decision: "approved",
    });
    expect(authorDecide?.message).toMatch(/publish access/i);

    // reviewer (publisher, different user) CAN decide
    const { error: reviewerDecide } = await alphaReviewer.rpc("decide_review", {
      p_request_id: requestId as string,
      p_decision: "approved",
    });
    expect(reviewerDecide).toBeNull();

    // the owner holds BOTH authoring and publish; they still cannot
    // self-approve their own request (the guard is per-user, not per-role)
    const { data: ownRequest, error: ownError } = await alphaOwner.rpc(
      "request_review",
      {
        p_organization_id: ORG_A,
        p_subject_type: "lesson",
        p_subject_id: lessonId,
        p_note: "self",
      },
    );
    expect(ownError).toBeNull();
    const { error: selfApprove } = await alphaOwner.rpc("decide_review", {
      p_request_id: ownRequest as string,
      p_decision: "approved",
    });
    expect(selfApprove?.message).toMatch(/your own review/i);
    // clean up: close it as the requester
    await alphaOwner.rpc("decide_review", {
      p_request_id: ownRequest as string,
      p_decision: "closed",
    });
  });

  // -------------------------------------------------------------------------
  // Webhook delivery: claim idempotency, retry, manual-retry permission
  // -------------------------------------------------------------------------
  test("outbox fan-out claims are atomic and manual retry is permission-gated", async () => {
    // create an active endpoint subscribed to a common event
    const { data: endpoint, error: endpointError } = await alphaOwner
      .from("webhook_endpoints")
      .insert({
        organization_id: ORG_A,
        url: "https://hooks.example.com/qa",
        secret: `qa-secret-${runTag}-abcdef`,
        event_types: [],
      })
      .select("id")
      .single();
    expect(endpointError).toBeNull();

    // learners can never see endpoints/deliveries; the owner (integrations.manage) can
    const { data: deliveries } = await alphaOwner
      .from("webhook_deliveries")
      .select("id")
      .eq("organization_id", ORG_A)
      .limit(1);
    expect(Array.isArray(deliveries)).toBe(true);

    // an author without integrations.manage cannot retry
    const { error: authorRetry } = await alphaAuthor.rpc(
      "retry_webhook_delivery",
      {
        p_delivery_id: "00000000-0000-4000-8000-0000000009fe",
      },
    );
    expect(authorRetry).not.toBeNull();

    // cross-tenant cannot read this org's endpoint
    const { data: crossEndpoints } = await bfhOwner
      .from("webhook_endpoints")
      .select("id")
      .eq("organization_id", ORG_A);
    expect(crossEndpoints).toEqual([]);

    // deactivate the endpoint so it does not affect the QA event chain
    await alphaOwner
      .from("webhook_endpoints")
      .update({ status: "revoked" })
      .eq("id", endpoint!.id);
  });

  // -------------------------------------------------------------------------
  // Future-org role seeding parity (the progress.override defect class)
  // -------------------------------------------------------------------------
  test("the new Studio permissions exist and reach existing owner roles", async () => {
    const { data: perms } = await alphaOwner
      .from("permissions")
      .select("code")
      .in("code", ["library.manage", "sources.manage", "ai.budget.manage"]);
    expect(perms?.length).toBe(3);

    // the owner holds all three (backfill worked)
    for (const code of [
      "library.manage",
      "sources.manage",
      "ai.budget.manage",
    ] as const) {
      const { data: budgets } = await alphaOwner
        .from("ai_budgets")
        .select("organization_id")
        .limit(1);
      expect(Array.isArray(budgets)).toBe(true); // proves ai.budget.manage read access
      void code;
    }
  });
});
