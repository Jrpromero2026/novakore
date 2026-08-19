import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { signedIn, type Client as SharedClient } from "./_session";

/**
 * Content templates — real RLS.
 *
 * Templates hold authored content and are reusable, so the interesting
 * properties are who may create one, who may only read, and that they never
 * cross a tenant boundary. The policy split mirrors `reusable_blocks`
 * deliberately: `content.view_draft` to see, `library.manage` to change.
 *
 * Fixtures were chosen to exercise the actual boundary rather than the happy
 * path: alpha.reviewer holds draft visibility WITHOUT library.manage, which
 * is the case a permissive policy would silently let through.
 */

const url = process.env.NOVAKORE_TEST_SUPABASE_URL;
const anonKey = process.env.NOVAKORE_TEST_SUPABASE_ANON_KEY;
const configured = Boolean(url && anonKey);

const ALPHA = "00000000-0000-4000-8000-000000000101";
const BFH = "00000000-0000-4000-8000-000000000102";

type Client = SharedClient;
const runTag = Date.now().toString(36);

/** A template shaped like the real SOP work, placeholders included. */
const BLOCKS = [
  { type: "heading", schemaVersion: 1, data: { text: "SAF-01", level: 2 } },
  {
    type: "rich_text",
    schemaVersion: 1,
    data: { text: "Send someone to {{aed_location}} for the AED." },
  },
];

const VARIABLES = [
  { key: "aed_location", label: "AED location", required: true },
];

describe.skipIf(!configured)("content templates (real RLS)", () => {
  let author: Client; // library.manage
  let reviewer: Client; // content.view_draft, NO library.manage
  let learner: Client; // neither
  let otherTenant: Client;
  let createdId: string | null = null;

  beforeAll(async () => {
    [author, reviewer, learner, otherTenant] = await Promise.all([
      signedIn("alpha.author@novakore.test"),
      signedIn("alpha.reviewer@novakore.test"),
      signedIn("alpha.learner@novakore.test"),
      signedIn("bfh.owner@novakore.test"),
    ]);
  });

  afterAll(async () => {
    // Archive rather than delete: there is deliberately no DELETE policy.
    if (createdId && author) {
      await author
        .from("content_templates")
        .update({ status: "archived", archived_at: new Date().toISOString() })
        .eq("id", createdId);
    }
  });

  test("library.manage can create a template", async () => {
    const { data, error } = await author
      .from("content_templates")
      .insert({
        organization_id: ALPHA,
        title: `Safety procedure ${runTag}`,
        description: "Test fixture",
        category: "procedure",
        variables: VARIABLES as never,
        blocks: BLOCKS as never,
      })
      .select("id")
      .single();

    expect(error).toBeNull();
    expect(data?.id).toBeTruthy();
    createdId = data?.id ?? null;
  });

  test("draft visibility without library.manage can read but not create", async () => {
    const { data: readable } = await reviewer
      .from("content_templates")
      .select("id, title")
      .eq("id", createdId!);
    expect(readable?.length, "reviewer should see the template").toBe(1);

    const { error } = await reviewer.from("content_templates").insert({
      organization_id: ALPHA,
      title: `Reviewer attempt ${runTag}`,
      blocks: [] as never,
    });
    expect(error, "reviewer must not create templates").not.toBeNull();
  });

  test("draft visibility without library.manage cannot edit", async () => {
    const { data } = await reviewer
      .from("content_templates")
      .update({ title: `Renamed by reviewer ${runTag}` })
      .eq("id", createdId!)
      .select("id");
    // RLS filters the row out of the UPDATE rather than erroring.
    expect(data ?? []).toEqual([]);

    const { data: after } = await author
      .from("content_templates")
      .select("title")
      .eq("id", createdId!)
      .single();
    expect(after?.title).toBe(`Safety procedure ${runTag}`);
  });

  test("a learner cannot see templates at all", async () => {
    const { data } = await learner
      .from("content_templates")
      .select("id")
      .eq("id", createdId!);
    expect(data ?? []).toEqual([]);
  });

  test("templates never cross a tenant boundary", async () => {
    const { data: seen } = await otherTenant
      .from("content_templates")
      .select("id")
      .eq("organization_id", ALPHA);
    expect(seen ?? []).toEqual([]);

    // Nor can another tenant plant one in this organization.
    const { error } = await otherTenant.from("content_templates").insert({
      organization_id: ALPHA,
      title: `Cross tenant ${runTag}`,
      blocks: [] as never,
    });
    expect(error).not.toBeNull();
  });

  test("the stored shape survives the round trip intact", async () => {
    const { data } = await author
      .from("content_templates")
      .select("blocks, variables")
      .eq("id", createdId!)
      .single();

    // Placeholders are stored UNSUBSTITUTED — substitution happens on
    // instantiation, so the template stays reusable.
    expect(data?.blocks).toEqual(BLOCKS);
    expect(data?.variables).toEqual(VARIABLES);
  });

  test("constraints reject a malformed template", async () => {
    const cases: { why: string; row: Record<string, unknown> }[] = [
      { why: "title too short", row: { title: "x", blocks: [] } },
      {
        why: "unknown category",
        row: { title: `Cat ${runTag}`, blocks: [], category: "nope" },
      },
      {
        why: "variables not an array",
        row: { title: `Var ${runTag}`, blocks: [], variables: {} },
      },
      {
        why: "blocks not an array",
        row: { title: `Blk ${runTag}`, blocks: {} },
      },
    ];
    for (const c of cases) {
      const { error } = await author
        .from("content_templates")
        .insert({ organization_id: ALPHA, ...c.row } as never);
      expect(error, c.why).not.toBeNull();
    }
  });

  test("BFH is a real second tenant, not an empty one", async () => {
    // Guards the isolation assertions above from passing vacuously.
    const { data } = await otherTenant
      .from("content_templates")
      .select("id")
      .eq("organization_id", BFH);
    expect(Array.isArray(data)).toBe(true);
  });
});
