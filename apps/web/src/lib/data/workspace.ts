import "server-only";
import { supabaseServer } from "../supabase/server";

/**
 * Workspace overview data (Platform Experience Transformation).
 *
 * Everything here derives from real tables: the `analytics_events` log
 * (org-wide under `analytics.view`), `feedback`, and content tables read
 * under the caller's RLS session. Nothing is synthesized — when a signal
 * has no data the caller renders a truthful empty state.
 *
 * Deliberately NOT provided: period-over-period trend percentages. The
 * event log does not yet span enough comparable history to make such a
 * comparison honest (docs/reports/platform-experience-transformation.md).
 */

/** Event types surfaced in the activity timeline, with human phrasing. */
const ACTIVITY_LABELS: Record<string, { verb: string; kind: string }> = {
  "content.course.published": { verb: "published", kind: "Course" },
  "content.lesson.published": { verb: "published", kind: "Lesson" },
  "content.assessment.created": { verb: "created", kind: "Assessment" },
  "content.assessment.published": { verb: "published", kind: "Assessment" },
  "review.request.created": { verb: "requested review of", kind: "Content" },
  "review.request.decided": { verb: "decided review of", kind: "Content" },
  "assessment.review.completed": {
    verb: "completed review of",
    kind: "Attempt",
  },
  "credential.certificate.issued": { verb: "issued", kind: "Credential" },
  "credential.certificate.revoked": { verb: "revoked", kind: "Credential" },
  "enrollment.learner.enrolled": { verb: "enrolled in", kind: "Journey" },
  "enrollment.learner.completed": { verb: "completed", kind: "Journey" },
  "learning.course.completed": { verb: "completed", kind: "Course" },
  "learning.path.completed": { verb: "completed", kind: "Path" },
  "ai.generation.completed": { verb: "generated", kind: "AI draft" },
};

/**
 * user_id → email, built from the two permission-gated sources: the
 * membership table (user_id ↔ membership_id) and `get_member_emails`
 * (membership_id ↔ email, itself gated on org.members.manage).
 */
async function actorEmailMap(
  organizationId: string,
): Promise<Map<string, string>> {
  const supabase = await supabaseServer();
  const [{ data: memberships }, { data: emails }] = await Promise.all([
    supabase
      .from("organization_memberships")
      .select("id, user_id")
      .eq("organization_id", organizationId),
    supabase.rpc("get_member_emails", { p_organization_id: organizationId }),
  ]);

  const emailByMembership = new Map<string, string>();
  for (const row of emails ?? []) {
    if (row.membership_id && row.email)
      emailByMembership.set(row.membership_id, row.email);
  }

  const byUser = new Map<string, string>();
  for (const m of memberships ?? []) {
    const email = emailByMembership.get(m.id);
    if (m.user_id && email) byUser.set(m.user_id, email);
  }
  return byUser;
}

export interface ActivityEntry {
  id: string;
  /** Namespaced event type, e.g. content.course.published. */
  type: string;
  kind: string;
  verb: string;
  actorEmail: string | null;
  occurredAt: string;
}

export interface DayVolume {
  /** ISO date (yyyy-mm-dd). */
  day: string;
  count: number;
}

export interface WorkspacePulse {
  activity: ActivityEntry[];
  /** Real daily event counts, oldest → newest, zero-filled across the window. */
  dailyVolume: DayVolume[];
  /** Total events inside the window. */
  windowTotal: number;
  windowDays: number;
}

/**
 * Recent workspace activity + real daily event volume.
 *
 * Requires `analytics.view` at the call site. Actor emails are resolved
 * ONLY when `resolveActors` is true, which the caller must gate on
 * `org.members.manage` — the member directory is a separate permission and
 * analytics.view alone must never surface member identities.
 */
export async function getWorkspacePulse(
  organizationId: string,
  { windowDays = 14, resolveActors = false } = {},
): Promise<WorkspacePulse> {
  const supabase = await supabaseServer();
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - (windowDays - 1));
  since.setUTCHours(0, 0, 0, 0);

  const [{ data: events }, actorEmails] = await Promise.all([
    supabase
      .from("analytics_events")
      .select("id, type, actor_user_id, occurred_at")
      .eq("organization_id", organizationId)
      .gte("occurred_at", since.toISOString())
      .order("occurred_at", { ascending: false })
      .limit(2000),
    resolveActors
      ? actorEmailMap(organizationId)
      : Promise.resolve(new Map<string, string>()),
  ]);

  const rows = events ?? [];
  const emailByUser = actorEmails;

  const activity: ActivityEntry[] = [];
  for (const row of rows) {
    const label = ACTIVITY_LABELS[row.type];
    if (!label) continue; // Only surface events we can describe truthfully.
    activity.push({
      id: row.id,
      type: row.type,
      kind: label.kind,
      verb: label.verb,
      actorEmail: row.actor_user_id
        ? (emailByUser.get(row.actor_user_id) ?? null)
        : null,
      occurredAt: row.occurred_at,
    });
    if (activity.length >= 12) break;
  }

  // Zero-filled daily buckets so the sparkline never implies missing days.
  const buckets = new Map<string, number>();
  for (let i = 0; i < windowDays; i += 1) {
    const d = new Date(since);
    d.setUTCDate(since.getUTCDate() + i);
    buckets.set(d.toISOString().slice(0, 10), 0);
  }
  for (const row of rows) {
    const day = row.occurred_at.slice(0, 10);
    if (buckets.has(day)) buckets.set(day, (buckets.get(day) ?? 0) + 1);
  }

  return {
    activity,
    dailyVolume: [...buckets.entries()].map(([day, count]) => ({
      day,
      count,
    })),
    windowTotal: rows.length,
    windowDays,
  };
}

export interface AttentionItem {
  id: string;
  label: string;
  detail: string;
  href: string;
  tone: "accent" | "warning" | "neutral";
}

export interface ContentComposition {
  published: number;
  draft: number;
  other: number;
  total: number;
}

/**
 * Course publishing composition — real status counts, no estimates.
 * Requires `content.view_draft` at the call site.
 */
export async function getContentComposition(
  organizationId: string,
): Promise<ContentComposition> {
  const supabase = await supabaseServer();
  const { data } = await supabase
    .from("courses")
    .select("status")
    .eq("organization_id", organizationId)
    .is("archived_at", null);

  const rows = data ?? [];
  const published = rows.filter((r) => r.status === "published").length;
  const draft = rows.filter((r) => r.status === "draft").length;
  return {
    published,
    draft,
    other: rows.length - published - draft,
    total: rows.length,
  };
}
