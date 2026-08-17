import "server-only";
import { supabaseServer } from "../supabase/server";

/**
 * Internal-alpha operations data. Observability is derived ENTIRELY from the
 * real analytics event log (`analytics_events`, readable org-wide under
 * `analytics.view`) and the feedback table — nothing is fabricated. All reads
 * run under the caller's RLS session.
 */

async function memberEmailMap(
  organizationId: string,
): Promise<Map<string, string>> {
  const supabase = await supabaseServer();
  const { data } = await supabase.rpc("get_member_emails", {
    p_organization_id: organizationId,
  });
  const map = new Map<string, string>();
  for (const row of data ?? [])
    if (row.membership_id && row.email) map.set(row.membership_id, row.email);
  return map;
}

export interface TesterCohortMember {
  membershipId: string;
  email: string | null;
  labels: string[];
}

export async function getTesterCohorts(
  organizationId: string,
): Promise<TesterCohortMember[]> {
  const supabase = await supabaseServer();
  const [{ data: labels }, emails] = await Promise.all([
    supabase
      .from("tester_labels")
      .select("membership_id, label")
      .eq("organization_id", organizationId),
    memberEmailMap(organizationId),
  ]);
  const byMember = new Map<string, string[]>();
  for (const row of labels ?? []) {
    const list = byMember.get(row.membership_id) ?? [];
    list.push(row.label);
    byMember.set(row.membership_id, list);
  }
  return [...byMember.entries()]
    .map(([membershipId, ls]) => ({
      membershipId,
      email: emails.get(membershipId) ?? null,
      labels: ls.sort(),
    }))
    .sort((a, b) => (a.email ?? "").localeCompare(b.email ?? ""));
}

export interface OpsMetrics {
  activeLearners: number;
  enrollments: number;
  lessonsStarted: number;
  lessonsCompleted: number;
  coursesCompleted: number;
  journeysCompleted: number;
  evaluationsPassed: number;
  evaluationsFailed: number;
  credentialsIssued: number;
  feedbackByStatus: Record<string, number>;
  dropOff: {
    lessonId: string;
    title: string;
    started: number;
    completed: number;
    gap: number;
  }[];
}

export async function getOpsMetrics(
  organizationId: string,
  cohort?: string,
): Promise<OpsMetrics> {
  const supabase = await supabaseServer();

  // Counts, distinct learners, and drop-off are aggregated in Postgres over
  // the indexed (organization_id, type) path — see migration
  // 20260817040230. The previous implementation pulled up to 5,000 raw rows
  // and counted them in JS, which was both O(events) per render and silently
  // WRONG past the limit (the newest 5,000 rows are not the organization).
  const [{ data: metrics }, { data: feedback }] = await Promise.all([
    supabase.rpc("org_event_metrics", {
      p_organization_id: organizationId,
      p_cohort: cohort ?? undefined,
    }),
    supabase
      .from("feedback")
      .select("status")
      .eq("organization_id", organizationId),
  ]);

  const agg = (metrics ?? {}) as {
    status?: string;
    counts?: Record<string, number>;
    active_learners?: number;
    drop_off?: {
      lesson_id: string;
      started: number;
      completed: number;
      gap: number;
    }[];
  };
  const counts = agg.counts ?? {};
  const count = (type: string) => counts[type] ?? 0;
  const gaps = agg.drop_off ?? [];

  let titles = new Map<string, string>();
  if (gaps.length) {
    const { data: lessons } = await supabase
      .from("lessons")
      .select("id, title")
      .in(
        "id",
        gaps.map((g) => g.lesson_id),
      );
    titles = new Map((lessons ?? []).map((l) => [l.id, l.title]));
  }

  const feedbackByStatus: Record<string, number> = {};
  for (const f of feedback ?? [])
    feedbackByStatus[f.status] = (feedbackByStatus[f.status] ?? 0) + 1;

  return {
    activeLearners: agg.active_learners ?? 0,
    enrollments: count("enrollment.learner.enrolled"),
    lessonsStarted: count("learning.lesson.started"),
    lessonsCompleted: count("learning.lesson.completed"),
    coursesCompleted: count("learning.course.completed"),
    journeysCompleted: count("learning.path.completed"),
    evaluationsPassed: count("assessment.attempt.passed"),
    evaluationsFailed: count("assessment.attempt.failed"),
    credentialsIssued: count("credential.certificate.issued"),
    feedbackByStatus,
    dropOff: gaps.map((g) => ({
      lessonId: g.lesson_id,
      started: g.started,
      completed: g.completed,
      gap: g.gap,
      title: titles.get(g.lesson_id) ?? "(unknown lesson)",
    })),
  };
}

export interface FeedbackRow {
  id: string;
  category: string;
  severity: string | null;
  message: string;
  context: Record<string, unknown>;
  status: string;
  notes: string | null;
  resolution: string | null;
  assigneeMembershipId: string | null;
  submitterEmail: string | null;
  createdAt: string;
}

export async function getFeedback(
  organizationId: string,
  filters: {
    status?: string;
    category?: string;
    severity?: string;
    q?: string;
  },
  /** 0-based inclusive slice of the FILTERED set. */
  range?: { from: number; to: number },
  /** Receives the total matching the filters (not the whole table). */
  out?: { total: number },
): Promise<FeedbackRow[]> {
  const supabase = await supabaseServer();
  let query = supabase
    .from("feedback")
    .select(
      "id, category, severity, message, context, status, notes, resolution, assignee_membership_id, membership_id, created_at",
      { count: "exact" },
    )
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .range(range?.from ?? 0, range?.to ?? 199);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.category) query = query.eq("category", filters.category);
  if (filters.severity) query = query.eq("severity", filters.severity);
  if (filters.q) query = query.ilike("message", `%${filters.q}%`);

  const [{ data, count }, emails] = await Promise.all([
    query,
    memberEmailMap(organizationId),
  ]);
  if (out) out.total = count ?? 0;
  return (data ?? []).map((row) => ({
    id: row.id,
    category: row.category,
    severity: row.severity,
    message: row.message,
    context: (row.context ?? {}) as Record<string, unknown>,
    status: row.status,
    notes: row.notes,
    resolution: row.resolution,
    assigneeMembershipId: row.assignee_membership_id,
    submitterEmail: emails.get(row.membership_id) ?? null,
    createdAt: row.created_at,
  }));
}
