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

  // Optional cohort filter → the set of user ids in that tester label.
  let cohortUsers: Set<string> | null = null;
  if (cohort) {
    const [{ data: labels }, { data: members }] = await Promise.all([
      supabase
        .from("tester_labels")
        .select("membership_id")
        .eq("organization_id", organizationId)
        .eq("label", cohort),
      supabase
        .from("organization_memberships")
        .select("id, user_id")
        .eq("organization_id", organizationId),
    ]);
    const ids = new Set((labels ?? []).map((l) => l.membership_id));
    cohortUsers = new Set(
      (members ?? [])
        .filter((m) => ids.has(m.id))
        .map((m) => m.user_id)
        .filter((u): u is string => Boolean(u)),
    );
  }

  const [{ data: events }, { data: feedback }] = await Promise.all([
    supabase
      .from("analytics_events")
      .select("type, subject_id, actor_user_id")
      .eq("organization_id", organizationId)
      .order("occurred_at", { ascending: false })
      .limit(5000),
    supabase
      .from("feedback")
      .select("status")
      .eq("organization_id", organizationId),
  ]);

  const evs = (events ?? []).filter(
    (e) =>
      !cohortUsers || (e.actor_user_id && cohortUsers.has(e.actor_user_id)),
  );
  const count = (type: string) => evs.filter((e) => e.type === type).length;

  const learners = new Set(
    evs
      .filter(
        (e) =>
          e.type.startsWith("learning.") || e.type.startsWith("enrollment."),
      )
      .map((e) => e.actor_user_id)
      .filter((u): u is string => Boolean(u)),
  );

  // Drop-off: lessons started but not completed (from the event log).
  const started = new Map<string, number>();
  const done = new Map<string, number>();
  for (const e of evs) {
    if (e.type === "learning.lesson.started" && e.subject_id)
      started.set(e.subject_id, (started.get(e.subject_id) ?? 0) + 1);
    if (e.type === "learning.lesson.completed" && e.subject_id)
      done.set(e.subject_id, (done.get(e.subject_id) ?? 0) + 1);
  }
  const gaps = [...started.entries()]
    .map(([lessonId, s]) => ({
      lessonId,
      started: s,
      completed: done.get(lessonId) ?? 0,
      gap: s - (done.get(lessonId) ?? 0),
    }))
    .filter((g) => g.gap > 0)
    .sort((a, b) => b.gap - a.gap)
    .slice(0, 5);

  let titles = new Map<string, string>();
  if (gaps.length) {
    const { data: lessons } = await supabase
      .from("lessons")
      .select("id, title")
      .in(
        "id",
        gaps.map((g) => g.lessonId),
      );
    titles = new Map((lessons ?? []).map((l) => [l.id, l.title]));
  }

  const feedbackByStatus: Record<string, number> = {};
  for (const f of feedback ?? [])
    feedbackByStatus[f.status] = (feedbackByStatus[f.status] ?? 0) + 1;

  return {
    activeLearners: learners.size,
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
      ...g,
      title: titles.get(g.lessonId) ?? "(unknown lesson)",
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
): Promise<FeedbackRow[]> {
  const supabase = await supabaseServer();
  let query = supabase
    .from("feedback")
    .select(
      "id, category, severity, message, context, status, notes, resolution, assignee_membership_id, membership_id, created_at",
    )
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.category) query = query.eq("category", filters.category);
  if (filters.severity) query = query.eq("severity", filters.severity);
  if (filters.q) query = query.ilike("message", `%${filters.q}%`);

  const [{ data }, emails] = await Promise.all([
    query,
    memberEmailMap(organizationId),
  ]);
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
