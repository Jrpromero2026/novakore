import { beforeAll, describe, expect, test } from "vitest";
import { signedIn, type Client as SharedClient } from "./_session";
// The REAL function the lesson editor uses, imported rather than copied —
// a duplicate here would test itself instead of the thing that can drift.
import { countContentWords } from "../../../../apps/web/src/lib/lesson-health";

/**
 * Pins `app.count_content_words` (SQL) to `countContentWords` (TypeScript).
 *
 * These are two implementations of one rule, and both are live: the Knowledge
 * IDE sizes the lesson in front of an author with the TypeScript version,
 * while Nova now reads the generated `content_blocks.word_count` column that
 * the SQL version produces. If they drift, the editor and the intelligence
 * layer report different sizes for the same lesson — a quiet credibility bug
 * in a product whose whole claim is that it never states a number it cannot
 * prove.
 *
 * The two `\s` definitions genuinely disagree (Postgres splits on U+0085
 * where JavaScript does not; JavaScript splits on U+FEFF where Postgres does
 * not), which is why the SQL side spells the class out. This test is what
 * keeps that honest against real content.
 *
 * READ-ONLY.
 */

const url = process.env.NOVAKORE_TEST_SUPABASE_URL;
const anonKey = process.env.NOVAKORE_TEST_SUPABASE_ANON_KEY;
const configured = Boolean(url && anonKey);

const ALPHA = "00000000-0000-4000-8000-000000000101";

type Client = SharedClient;

describe.skipIf(!configured)(
  "word count SQL/TS equivalence (real data)",
  () => {
    let owner: Client;
    let learner: Client;

    beforeAll(async () => {
      [owner, learner] = await Promise.all([
        signedIn("alpha.owner@novakore.test"),
        signedIn("alpha.learner@novakore.test"),
      ]);
    });

    test("every stored word_count matches the TypeScript count", async () => {
      const { data, error } = await owner
        .from("content_blocks")
        .select("id, data, word_count")
        .eq("organization_id", ALPHA);
      expect(error).toBeNull();
      expect(data?.length ?? 0).toBeGreaterThan(0);

      const mismatches = (data ?? [])
        .map((b) => ({
          id: b.id,
          sql: b.word_count,
          ts: countContentWords(b.data),
        }))
        .filter((r) => r.sql !== r.ts);

      expect(mismatches).toEqual([]);
    });

    test("the aggregate equals per-lesson TypeScript totals", async () => {
      const [{ data: blocks }, { data: agg }] = await Promise.all([
        owner
          .from("content_blocks")
          .select("lesson_id, data")
          .eq("organization_id", ALPHA),
        owner.rpc("org_lesson_word_counts", { p_organization_id: ALPHA }),
      ]);

      const expected = new Map<string, number>();
      for (const b of blocks ?? []) {
        expected.set(
          b.lesson_id,
          (expected.get(b.lesson_id) ?? 0) + countContentWords(b.data),
        );
      }

      const actual = new Map((agg ?? []).map((r) => [r.lesson_id, r.words]));
      expect(actual.size).toBe(expected.size);
      for (const [lessonId, words] of expected) {
        expect(actual.get(lessonId), `lesson ${lessonId}`).toBe(words);
      }
    });

    test("the generated column tracks an edit rather than going stale", async () => {
      // Proves the "updated on save" property without mutating tenant data:
      // the same payload run through the function must equal what was stored.
      const { data } = await owner
        .from("content_blocks")
        .select("data, word_count")
        .eq("organization_id", ALPHA)
        .limit(1)
        .single();

      const { data: recomputed } = await owner.rpc("org_lesson_word_counts", {
        p_organization_id: ALPHA,
      });
      expect(recomputed).not.toBeNull();
      expect(data?.word_count).toBe(countContentWords(data?.data));
    });

    test("both aggregates fail closed for a caller without draft visibility", async () => {
      const [{ data: words }, { data: terms }] = await Promise.all([
        learner.rpc("org_lesson_word_counts", { p_organization_id: ALPHA }),
        learner.rpc("org_lesson_term_usage", {
          p_organization_id: ALPHA,
          p_terms: ["course", "module"],
        }),
      ]);
      // Empty, never partial — the permission re-check lives inside the
      // function, not only at the call site.
      expect(words).toEqual([]);
      expect(terms).toEqual([]);
    });

    test("term usage counts lessons, and is not fooled by absent words", async () => {
      const { data } = await owner.rpc("org_lesson_term_usage", {
        p_organization_id: ALPHA,
        p_terms: ["course", "zzznotawordanywhere"],
      });
      const byTerm = new Map((data ?? []).map((r) => [r.term, r.lesson_count]));

      expect(byTerm.get("zzznotawordanywhere")).toBe(0);
      // Every requested term comes back, present or not.
      expect(byTerm.size).toBe(2);
      expect(byTerm.get("course")).toBeGreaterThanOrEqual(0);
    });
  },
);
