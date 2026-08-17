import { afterAll, describe, expect, test } from "vitest";
import { signedIn } from "./_session";

/**
 * Analytics rollups (CTO review P1-7) proven against the live database.
 *
 * These aggregates replaced JavaScript counting over up-to-5,000 raw event
 * rows. The contract that matters is EQUIVALENCE: the aggregate must equal
 * ground truth counted independently in the same session — otherwise the
 * platform would be reporting numbers it cannot prove, which is the one
 * thing NovaKore's surfaces are not allowed to do.
 *
 * Also proven: the analytics permission gate, and that a cohort with no
 * members matches nothing rather than everything (the failure mode a naive
 * `= any(null)` filter would have introduced).
 */

const url = process.env.NOVAKORE_TEST_SUPABASE_URL!;
const anonKey = process.env.NOVAKORE_TEST_SUPABASE_ANON_KEY!;
const ALPHA_ORG = "00000000-0000-4000-8000-000000000101";

// Sessions come from the suite-wide pool (vitest.globalSetup.ts); no
// sign-out here, that would revoke tokens other files share.

interface Metrics {
  status: string;
  counts: Record<string, number>;
  active_learners: number;
  drop_off: {
    lesson_id: string;
    started: number;
    completed: number;
    gap: number;
  }[];
}

describe("analytics rollups", () => {
  test("aggregate type counts equal independently counted ground truth", async () => {
    const admin = await signedIn("alpha.owner@novakore.test");

    const { data, error } = await admin.rpc("org_event_metrics", {
      p_organization_id: ALPHA_ORG,
    });
    expect(error).toBeNull();
    const metrics = data as unknown as Metrics;
    expect(metrics.status).toBe("ok");

    // Independent ground truth for a type the aggregate reported.
    const types = Object.keys(metrics.counts);
    expect(types.length).toBeGreaterThan(0);
    for (const type of types.slice(0, 3)) {
      const { count } = await admin
        .from("analytics_events")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", ALPHA_ORG)
        .eq("type", type);
      expect(metrics.counts[type], `count mismatch for ${type}`).toBe(count);
    }
  });

  test("drop-off rows are internally consistent and ranked by gap", async () => {
    const admin = await signedIn("alpha.owner@novakore.test");
    const { data } = await admin.rpc("org_event_metrics", {
      p_organization_id: ALPHA_ORG,
    });
    const metrics = data as unknown as Metrics;

    expect(metrics.drop_off.length).toBeLessThanOrEqual(5);
    for (const row of metrics.drop_off) {
      expect(row.started).toBeGreaterThan(row.completed);
      expect(row.gap).toBe(row.started - row.completed);
    }
    const gaps = metrics.drop_off.map((r) => r.gap);
    expect([...gaps].sort((a, b) => b - a)).toEqual(gaps);
  });

  test("a cohort with no members matches nothing, not everything", async () => {
    const admin = await signedIn("alpha.owner@novakore.test");
    const { data } = await admin.rpc("org_event_metrics", {
      p_organization_id: ALPHA_ORG,
      p_cohort: "cohort-that-does-not-exist",
    });
    const metrics = data as unknown as Metrics;
    expect(metrics.status).toBe("ok");
    expect(Object.keys(metrics.counts)).toHaveLength(0);
    expect(metrics.active_learners).toBe(0);
  });

  test("windowed series totals equal ground truth over the same window", async () => {
    const admin = await signedIn("alpha.owner@novakore.test");
    const windowDays = 14;
    const { data, error } = await admin.rpc("org_event_daily_by_type", {
      p_organization_id: ALPHA_ORG,
      p_window_days: windowDays,
    });
    expect(error).toBeNull();
    const series = data as unknown as {
      status: string;
      rows: { day: string; type: string; count: number }[];
      total: number;
      learning_actors: string[];
    };
    expect(series.status).toBe("ok");

    // The bucket sum must equal the reported total…
    const summed = series.rows.reduce((s, r) => s + r.count, 0);
    expect(summed).toBe(series.total);

    // …and the total must equal an independent count over the same window.
    const since = new Date();
    since.setUTCHours(0, 0, 0, 0);
    since.setUTCDate(since.getUTCDate() - (windowDays - 1));
    const { count } = await admin
      .from("analytics_events")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", ALPHA_ORG)
      .gte("occurred_at", since.toISOString());
    expect(series.total).toBe(count);
  });

  test("analytics rollups are refused without analytics.view", async () => {
    const learner = await signedIn("alpha.learner@novakore.test");

    const metrics = await learner.rpc("org_event_metrics", {
      p_organization_id: ALPHA_ORG,
    });
    expect((metrics.data as unknown as { status: string }).status).toBe(
      "forbidden",
    );

    const series = await learner.rpc("org_event_daily_by_type", {
      p_organization_id: ALPHA_ORG,
      p_window_days: 7,
    });
    expect((series.data as unknown as { status: string }).status).toBe(
      "forbidden",
    );
  });
});
