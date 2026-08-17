import "server-only";
import { cached, orgCacheKey } from "../cache";
import { supabaseServer } from "../supabase/server";

/**
 * Knowledge titles for the command palette's global search.
 *
 * These four queries run in the admin layout, which means they run on EVERY
 * navigation inside the workspace — to populate a palette most users never
 * open. Measured against the dev database, the fan-out costs ~250ms p50 of
 * round-trip time per navigation. That is what this cache removes.
 *
 * WHY IT IS SAFE TO SHARE THIS ENTRY BETWEEN USERS
 * -------------------------------------------------
 * A cached row set is served to other members of the same organization, so
 * it is only sound if every caller would have seen exactly the same rows.
 * Checked against the live policies, each table reduces to the same org-wide
 * permission:
 *
 *   lessons          has_org_permission(org, 'content.view_draft')
 *   courses          can_access_course(org, id), which short-circuits on
 *                    has_org_permission(org, 'content.view_draft')
 *   learning_paths   is_org_member AND (active OR view_draft) → all rows for
 *                    a view_draft holder
 *   assessments      has_org_permission(org, 'content.view_draft')
 *
 * and `has_org_permission` counts only role assignments with
 * `academy_id is null`, so the permission is org-wide rather than
 * academy-scoped. `effectiveOrgPermissions` applies the identical rule in
 * TypeScript (it skips grants with an academyId), so the caller-side gate
 * and the database policy agree.
 *
 * Therefore: for any caller holding org-wide `content.view_draft`, all four
 * queries return the whole organization's rows. The result is a function of
 * the organization alone, and the entry is keyed that way.
 *
 * This equivalence is a claim about live RLS, not a comment — it is pinned
 * by a real-DB test (`palette-cache-audience.test.ts`) so that changing one
 * of those policies fails the suite instead of quietly leaking rows.
 *
 * CALLERS MUST GATE ON `content.view_draft` BEFORE CALLING THIS.
 */

export interface PaletteKnowledge {
  lessons: { id: string; course_id: string; title: string }[];
  courses: { id: string; title: string }[];
  paths: { id: string; title: string }[];
  assessments: { id: string; title: string }[];
}

/**
 * Short by design. The palette is a convenience surface, so a minute of
 * staleness is invisible, while authoring changes invalidate the entry
 * outright (see `invalidateOrg`) so an author never fails to find their own
 * new content.
 */
const TTL_MS = 60_000;

export async function getPaletteKnowledge(
  organizationId: string,
): Promise<PaletteKnowledge> {
  return cached(
    orgCacheKey("palette", organizationId, "content.view_draft"),
    TTL_MS,
    async () => {
      const supabase = await supabaseServer();
      const [
        { data: lessons },
        { data: courses },
        { data: paths },
        { data: assessments },
      ] = await Promise.all([
        supabase
          .from("lessons")
          .select("id, course_id, title")
          .eq("organization_id", organizationId)
          .is("archived_at", null)
          .order("updated_at", { ascending: false })
          .limit(30),
        supabase
          .from("courses")
          .select("id, title")
          .eq("organization_id", organizationId)
          .neq("status", "archived")
          .limit(20),
        supabase
          .from("learning_paths")
          .select("id, title")
          .eq("organization_id", organizationId)
          .neq("status", "archived")
          .limit(10),
        supabase
          .from("assessments")
          .select("id, title")
          .eq("organization_id", organizationId)
          .neq("status", "archived")
          .limit(10),
      ]);

      return {
        lessons: lessons ?? [],
        courses: courses ?? [],
        paths: paths ?? [],
        assessments: assessments ?? [],
      };
    },
  );
}
