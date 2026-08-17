import { beforeAll, describe, expect, test } from "vitest";
import { signedIn, type Client as SharedClient } from "./_session";

/**
 * Pins the RLS equivalence that the org-keyed palette cache depends on.
 *
 * `apps/web/src/lib/data/palette.ts` caches four queries under a key made of
 * the organization id alone, and serves that entry to any caller holding
 * org-wide `content.view_draft`. That is only sound while every one of those
 * four policies resolves to the same org-wide permission:
 *
 *   lessons          has_org_permission(org, 'content.view_draft')
 *   courses          can_access_course(org, id) → short-circuits on it
 *   learning_paths   is_org_member AND (active OR view_draft)
 *   assessments      has_org_permission(org, 'content.view_draft')
 *
 * If someone later scopes one of these by academy, by author, or by
 * enrollment, the cache would start serving rows the second caller was never
 * entitled to. A comment cannot catch that. This test can: it asserts the
 * equivalence directly against live RLS, so the change fails here instead of
 * leaking in production.
 *
 * READ-ONLY, like the rest of this suite.
 */

const url = process.env.NOVAKORE_TEST_SUPABASE_URL;
const anonKey = process.env.NOVAKORE_TEST_SUPABASE_ANON_KEY;
const configured = Boolean(url && anonKey);

const ALPHA = "00000000-0000-4000-8000-000000000101";

type Client = SharedClient;

/**
 * The four palette reads, but over the COMPLETE visible set and in a
 * deterministic order.
 *
 * The production loader takes a small `.limit()` slice of each table. This
 * test deliberately drops those limits, for two reasons. Those queries carry
 * no total ordering, so two callers with an identical visible set could still
 * receive different arbitrary slices — comparing slices would make this test
 * flaky and prove nothing. And the property the cache actually relies on is
 * that the underlying visible sets are equal; once that holds, any
 * deterministic slice of them is equal too. Proving the stronger claim is
 * both more stable and more meaningful.
 */
async function paletteRows(client: Client, organizationId: string) {
  const [lessons, courses, paths, assessments] = await Promise.all([
    client
      .from("lessons")
      .select("id")
      .eq("organization_id", organizationId)
      .is("archived_at", null)
      .order("id"),
    client
      .from("courses")
      .select("id")
      .eq("organization_id", organizationId)
      .neq("status", "archived")
      .order("id"),
    client
      .from("learning_paths")
      .select("id")
      .eq("organization_id", organizationId)
      .neq("status", "archived")
      .order("id"),
    client
      .from("assessments")
      .select("id")
      .eq("organization_id", organizationId)
      .neq("status", "archived")
      .order("id"),
  ]);
  const ids = (r: { data: { id: string }[] | null }) =>
    (r.data ?? []).map((x) => x.id).sort();
  return {
    lessons: ids(lessons),
    courses: ids(courses),
    paths: ids(paths),
    assessments: ids(assessments),
  };
}

describe.skipIf(!configured)("palette cache audience (real RLS)", () => {
  // Four org-wide `content.view_draft` holders, deliberately spanning
  // different roles — owner, admin, author, reviewer — so the claim is not
  // an accident of one role's grant set.
  let owner: Client;
  let admin: Client;
  let author: Client;
  let reviewer: Client;
  // Holds `content.view_draft` for an ACADEMY only. `has_org_permission`
  // counts assignments with `academy_id is null`, so this is not a holder.
  let academyScoped: Client;
  let learner: Client;
  let otherTenant: Client;

  beforeAll(async () => {
    [owner, admin, author, reviewer, academyScoped, learner, otherTenant] =
      await Promise.all([
        signedIn("alpha.owner@novakore.test"),
        signedIn("alpha.admin@novakore.test"),
        signedIn("alpha.author@novakore.test"),
        signedIn("alpha.reviewer@novakore.test"),
        signedIn("alpha.academy@novakore.test"),
        signedIn("alpha.learner@novakore.test"),
        signedIn("bfh.owner@novakore.test"),
      ]);
  });

  test("every org-wide view_draft holder sees an identical row set", async () => {
    const [a, b, c, d] = await Promise.all([
      paletteRows(owner, ALPHA),
      paletteRows(admin, ALPHA),
      paletteRows(author, ALPHA),
      paletteRows(reviewer, ALPHA),
    ]);

    // A cached entry produced by any one of these is correct for all of them.
    expect(b).toEqual(a);
    expect(c).toEqual(a);
    expect(d).toEqual(a);

    // Guard against the assertion passing vacuously on empty tables.
    expect(a.lessons.length).toBeGreaterThan(0);
    expect(a.courses.length).toBeGreaterThan(0);
  });

  test("an academy-scoped grant is NOT the org-wide audience", async () => {
    const holder = await paletteRows(owner, ALPHA);
    const scoped = await paletteRows(academyScoped, ALPHA);

    // `has_org_permission` requires academy_id is null, so the two tables
    // gated purely on it must return nothing here.
    expect(scoped.lessons).toEqual([]);
    expect(scoped.assessments).toEqual([]);
    // Which means this caller must never be served the holder's entry.
    expect(scoped).not.toEqual(holder);
  });

  test("a learner sees a subset, never the holder's set", async () => {
    const holder = await paletteRows(owner, ALPHA);
    const seen = await paletteRows(learner, ALPHA);

    // Gated purely on org-wide view_draft.
    expect(seen.lessons).toEqual([]);

    // The other three are readable by a plain member under a SECOND,
    // narrower policy — active paths, enrolled courses, and published
    // assessments assigned to a course they can reach. So a learner
    // legitimately sees some rows; what matters for the cache is that the
    // set is a strict subset of the holder's and never equal to it.
    for (const key of ["courses", "paths", "assessments"] as const) {
      expect(
        seen[key].every((id) => holder[key].includes(id)),
        `${key} visible to a learner must be a subset of the holder's`,
      ).toBe(true);
    }
    expect(seen).not.toEqual(holder);
  });

  test("the cache key's organization scope matches RLS reality", async () => {
    // Another tenant's owner sees none of this organization's rows, so an
    // org-keyed entry can never cross a tenant boundary.
    const foreign = await paletteRows(otherTenant, ALPHA);
    expect(foreign).toEqual({
      lessons: [],
      courses: [],
      paths: [],
      assessments: [],
    });
  });
});
