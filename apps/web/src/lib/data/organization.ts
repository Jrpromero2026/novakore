import "server-only";
import { supabaseServer } from "../supabase/server";
import { parseOrgIdentity, type OrgIdentity } from "../org-identity";

/**
 * Organization Hub data — identity, membership growth, and the living
 * timeline. Every timeline entry is a real dated record (table timestamps,
 * immutable versions); nothing is reconstructed from guesswork. Reads run
 * under the caller's RLS session.
 */

export interface OrgTimelineEntry {
  id: string;
  at: string;
  title: string;
  detail?: string;
}

export interface OrganizationHubData {
  identity: OrgIdentity;
  createdAt: string | null;
  members: {
    active: number;
    invited: number;
    /** Real joins per month (yyyy-mm), oldest → newest. */
    joinedByMonth: { month: string; count: number }[];
  };
  timeline: OrgTimelineEntry[];
  /** Latest published lesson versions (title + when), newest first. */
  recentPublishing: { id: string; title: string; publishedAt: string }[];
}

export async function getOrganizationHub(
  organizationId: string,
): Promise<OrganizationHubData> {
  const supabase = await supabaseServer();
  const [
    { data: org },
    { data: settings },
    { data: memberships },
    { data: branding },
    { data: academies },
    { data: paths },
    { data: versions },
  ] = await Promise.all([
    supabase
      .from("organizations")
      .select("created_at, name")
      .eq("id", organizationId)
      .maybeSingle(),
    supabase
      .from("organization_settings")
      .select("settings")
      .eq("organization_id", organizationId)
      .maybeSingle(),
    supabase
      .from("organization_memberships")
      .select("status, created_at")
      .eq("organization_id", organizationId),
    supabase
      .from("organization_branding")
      .select("published_at")
      .eq("organization_id", organizationId)
      .maybeSingle(),
    supabase
      .from("academies")
      .select("id, name, created_at")
      .eq("organization_id", organizationId)
      .order("created_at"),
    supabase
      .from("learning_paths")
      .select("id, title, created_at")
      .eq("organization_id", organizationId)
      .neq("status", "archived")
      .order("created_at"),
    supabase
      .from("lesson_versions")
      .select("id, title, published_at")
      .eq("organization_id", organizationId)
      .order("published_at", { ascending: false })
      .limit(400),
  ]);

  const rows = memberships ?? [];
  const active = rows.filter((m) => m.status === "active");
  const joined = new Map<string, number>();
  for (const m of active) {
    const month = m.created_at.slice(0, 7);
    joined.set(month, (joined.get(month) ?? 0) + 1);
  }

  // ---- The living timeline: real dated records, milestone language --------
  const timeline: OrgTimelineEntry[] = [];
  if (org?.created_at) {
    timeline.push({
      id: "founded",
      at: org.created_at,
      title: `${org.name} joined NovaKore`,
    });
  }
  for (const a of academies ?? []) {
    timeline.push({
      id: `academy-${a.id}`,
      at: a.created_at,
      title: `Launched the ${a.name} academy`,
    });
  }
  if (branding?.published_at) {
    timeline.push({
      id: "brand",
      at: branding.published_at,
      title: "Published the organization's brand theme",
    });
  }
  for (const p of paths ?? []) {
    timeline.push({
      id: `path-${p.id}`,
      at: p.created_at,
      title: `Created the “${p.title}” journey`,
    });
  }
  const publishes = versions ?? [];
  const firstPublish = publishes.at(-1);
  if (firstPublish) {
    timeline.push({
      id: "first-publish",
      at: firstPublish.published_at,
      title: "First lesson published",
      detail: `“${firstPublish.title}” opened the knowledge base`,
    });
  }
  if (publishes.length >= 20) {
    // The 20th oldest publish = the moment the org crossed 20 versions.
    const twentieth = publishes[publishes.length - 20]!;
    timeline.push({
      id: "publish-20",
      at: twentieth.published_at,
      title: "20 published lesson versions",
      detail: "The knowledge base reached real depth",
    });
  }
  timeline.sort((a, b) => (a.at < b.at ? 1 : -1));

  return {
    identity: parseOrgIdentity(settings?.settings ?? null),
    createdAt: org?.created_at ?? null,
    members: {
      active: active.length,
      invited: rows.filter((m) => m.status === "invited").length,
      joinedByMonth: [...joined.entries()]
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([month, count]) => ({ month, count })),
    },
    timeline: timeline.slice(0, 12),
    recentPublishing: publishes.slice(0, 5).map((v) => ({
      id: v.id,
      title: v.title,
      publishedAt: v.published_at,
    })),
  };
}
