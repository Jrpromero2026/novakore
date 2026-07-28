import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Database } from "../types/database";

/**
 * Media + storage isolation suite (Phase 1B). Runs against the REAL
 * novakore-dev instance: real sign-ins, real storage RLS, real relational
 * RLS — nothing mocked. Storage policies and media_assets policies must
 * agree; this suite exercises both sides.
 */

const url = process.env.NOVAKORE_TEST_SUPABASE_URL;
const anonKey = process.env.NOVAKORE_TEST_SUPABASE_ANON_KEY;
const configured = Boolean(url && anonKey);

const ORG_A = "00000000-0000-4000-8000-000000000101";
const ORG_B = "00000000-0000-4000-8000-000000000102";
const DEV_PASSWORD = "NovaKore-dev-password-1";

// 1×1 transparent PNG (real bytes — the pipeline sniffs content).
const TINY_PNG = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  ),
  (c) => c.charCodeAt(0),
);

type Client = SupabaseClient<Database>;
const clients = new Map<string, Client>();

function bareClient(): Client {
  return createClient<Database>(url!, anonKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function signedIn(email: string): Promise<Client> {
  const cached = clients.get(email);
  if (cached) return cached;
  const client = bareClient();
  const { error } = await client.auth.signInWithPassword({
    email,
    password: DEV_PASSWORD,
  });
  if (error) throw new Error(`sign-in failed for ${email}: ${error.message}`);
  clients.set(email, client);
  return client;
}

const runId = crypto.randomUUID();
const pathIn = (orgId: string, tail: string) =>
  `organizations/${orgId}/branding/monogram/${runId}-${tail}`;

describe.skipIf(!configured)("media + storage isolation (real RLS)", () => {
  let alphaOwner: Client; // org.branding.manage + publish in A
  let alphaReviewer: Client; // member of A, no branding permissions
  let alphaLearner: Client;
  let bfhOwner: Client;

  beforeAll(async () => {
    [alphaOwner, alphaReviewer, alphaLearner, bfhOwner] = await Promise.all([
      signedIn("alpha.owner@novakore.test"),
      signedIn("alpha.reviewer@novakore.test"),
      signedIn("alpha.learner@novakore.test"),
      signedIn("bfh.owner@novakore.test"),
    ]);
  });

  afterAll(async () => {
    await Promise.all([...clients.values()].map((c) => c.auth.signOut()));
  });

  test("positive control: a branding manager can upload into their org path and read it back", async () => {
    const path = pathIn(ORG_A, "control/logo.png");
    const { error: uploadError } = await alphaOwner.storage
      .from("org-branding")
      .upload(path, TINY_PNG, { contentType: "image/png" });
    expect(uploadError).toBeNull();

    const { data: signed, error: signError } = await alphaOwner.storage
      .from("org-branding")
      .createSignedUrl(path, 60);
    expect(signError).toBeNull();
    expect(signed?.signedUrl).toContain("token=");

    // metadata row under RLS, then archive (history-preserving cleanup)
    const { data: row, error: insertError } = await alphaOwner
      .from("media_assets")
      .insert({
        organization_id: ORG_A,
        asset_kind: "monogram",
        storage_bucket: "org-branding",
        storage_path: path,
        original_filename: "logo.png",
        mime_type: "image/png",
        byte_size: TINY_PNG.byteLength,
        width: 1,
        height: 1,
        status: "pending",
      })
      .select("id")
      .single();
    expect(insertError).toBeNull();

    const { error: archiveError } = await alphaOwner
      .from("media_assets")
      .update({ status: "archived", archived_at: new Date().toISOString() })
      .eq("id", row!.id);
    expect(archiveError).toBeNull();
  });

  test("a tenant cannot write into another tenant's storage path", async () => {
    const { error } = await alphaOwner.storage
      .from("org-branding")
      .upload(pathIn(ORG_B, "cross/logo.png"), TINY_PNG, {
        contentType: "image/png",
      });
    expect(error).not.toBeNull();
  });

  test("metadata cannot point at another tenant (RLS + path CHECK)", async () => {
    // foreign organization_id → RLS with-check rejects
    const { error: crossOrg } = await alphaOwner.from("media_assets").insert({
      organization_id: ORG_B,
      asset_kind: "monogram",
      storage_bucket: "org-branding",
      storage_path: pathIn(ORG_B, "meta/logo.png"),
      original_filename: "logo.png",
      mime_type: "image/png",
      byte_size: 1,
    });
    expect(crossOrg).not.toBeNull();

    // own org id but foreign path → CHECK constraint rejects
    const { error: pathMismatch } = await alphaOwner
      .from("media_assets")
      .insert({
        organization_id: ORG_A,
        asset_kind: "monogram",
        storage_bucket: "org-branding",
        storage_path: pathIn(ORG_B, "mismatch/logo.png"),
        original_filename: "logo.png",
        mime_type: "image/png",
        byte_size: 1,
      });
    expect(pathMismatch).not.toBeNull();
  });

  test("cross-tenant metadata and signed URLs return nothing", async () => {
    const { data } = await bfhOwner
      .from("media_assets")
      .select("*")
      .eq("organization_id", ORG_A);
    expect(data).toEqual([]);

    const { data: signed, error } = await bfhOwner.storage
      .from("org-branding")
      .createSignedUrl(pathIn(ORG_A, "control/logo.png"), 60);
    expect(signed?.signedUrl ?? null).toBeNull();
    expect(error).not.toBeNull();
  });

  test("members without branding permissions can see but never write", async () => {
    // reviewer is a member: metadata SELECT works (rendering needs it)
    const { error: readError } = await alphaReviewer
      .from("media_assets")
      .select("id")
      .eq("organization_id", ORG_A)
      .limit(1);
    expect(readError).toBeNull();

    // …but cannot upload objects or insert metadata
    const { error: storageError } = await alphaReviewer.storage
      .from("org-branding")
      .upload(pathIn(ORG_A, "reviewer/logo.png"), TINY_PNG, {
        contentType: "image/png",
      });
    expect(storageError).not.toBeNull();

    const { error: metaError } = await alphaReviewer
      .from("media_assets")
      .insert({
        organization_id: ORG_A,
        asset_kind: "monogram",
        storage_bucket: "org-branding",
        storage_path: pathIn(ORG_A, "reviewer-meta/logo.png"),
        original_filename: "logo.png",
        mime_type: "image/png",
        byte_size: 1,
      });
    expect(metaError).not.toBeNull();

    // and cannot edit theme drafts (branding UPDATE policy)
    const { data: brandingUpdate } = await alphaReviewer
      .from("organization_branding")
      .update({ display_name: "Hijacked Brand" })
      .eq("organization_id", ORG_A)
      .select();
    expect(brandingUpdate).toEqual([]);
  });

  test("learners cannot upload brand assets", async () => {
    const { error } = await alphaLearner.storage
      .from("org-branding")
      .upload(pathIn(ORG_A, "learner/logo.png"), TINY_PNG, {
        contentType: "image/png",
      });
    expect(error).not.toBeNull();
  });

  test("suspended members lose media access entirely", async () => {
    const suspended = await signedIn("alpha.suspended@novakore.test");
    const { data } = await suspended.from("media_assets").select("id");
    expect(data).toEqual([]);
    const { error } = await suspended.storage
      .from("org-branding")
      .upload(pathIn(ORG_A, "suspended/logo.png"), TINY_PNG, {
        contentType: "image/png",
      });
    expect(error).not.toBeNull();
  });

  test("platform-branding assets are untouchable by tenant administrators", async () => {
    const { error: writeError } = await alphaOwner.storage
      .from("platform-branding")
      .upload(`platform/${runId}/logo.png`, TINY_PNG, {
        contentType: "image/png",
      });
    expect(writeError).not.toBeNull();

    const { data: listing, error: listError } = await alphaOwner.storage
      .from("platform-branding")
      .list("platform");
    expect(listing ?? []).toEqual([]);
    // list may return empty rather than error depending on policy evaluation;
    // the write denial above is the security-critical assertion
    void listError;

    // platform metadata rows (organization_id null) are invisible to tenants
    const { data: platformRows } = await alphaOwner
      .from("media_assets")
      .select("*")
      .is("organization_id", null);
    expect(platformRows).toEqual([]);
  });

  test("malformed storage paths never resolve to an organization", async () => {
    for (const badPath of [
      "organizations/../../etc/passwd",
      `organizations/not-a-uuid/branding/monogram/${runId}.png`,
      `orgs/${ORG_A}/branding/monogram/${runId}.png`,
    ]) {
      const { error } = await alphaOwner.storage
        .from("org-branding")
        .upload(badPath, TINY_PNG, { contentType: "image/png" });
      expect(error, `path should be rejected: ${badPath}`).not.toBeNull();
    }
  });

  test("anonymous clients cannot touch media metadata or storage", async () => {
    const anon = bareClient();
    const { data, error } = await anon.from("media_assets").select("*");
    expect(data ?? []).toEqual([]);
    expect(error).not.toBeNull();

    const { error: storageError } = await anon.storage
      .from("org-branding")
      .upload(pathIn(ORG_A, "anon/logo.png"), TINY_PNG, {
        contentType: "image/png",
      });
    expect(storageError).not.toBeNull();
  });
});
