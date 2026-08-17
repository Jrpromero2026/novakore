import type { Metadata } from "next";
import { requireOrgContext, requirePermission } from "@/lib/org-context";
import { getTerminology } from "@/lib/terminology";
import { supabaseServer } from "@/lib/supabase/server";
import { PageHeader, Panel, SectionHeader } from "@/components/ui/layout";
import { tourState } from "@/lib/onboarding/targets";
import { pageMeta, parsePage, rangeFor } from "@/lib/pagination";
import { Pagination } from "@/components/ui/pagination";
import { InvitePanel, MemberRow } from "./members-ui";

export const metadata: Metadata = { title: "Members" };

export default async function MembersPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { orgSlug } = await params;
  const sp = await searchParams;
  const ctx = await requireOrgContext(orgSlug);
  requirePermission(ctx, "org.members.manage");

  const supabase = await supabaseServer();
  const page = parsePage(sp.page);
  const range = rangeFor(page);
  const [
    { data: memberships, count: memberTotal },
    { data: roles },
    { data: academies },
    { data: emails },
    { count: othersTotal },
  ] = await Promise.all([
    supabase
      .from("organization_memberships")
      .select(
        "id, status, user_id, invited_email, invited_at, accepted_at, organization_member_roles(id, academy_id, organization_roles(id, name, key))",
        { count: "exact" },
      )
      .eq("organization_id", ctx.organization.id)
      .neq("status", "removed")
      .order("created_at")
      .range(range.from, range.to),
    supabase
      .from("organization_roles")
      .select("id, name, key, is_system")
      .eq("organization_id", ctx.organization.id)
      .eq("status", "active")
      .order("is_system", { ascending: false })
      .order("name"),
    supabase
      .from("academies")
      .select("id, name")
      .eq("organization_id", ctx.organization.id)
      .neq("status", "archived")
      .order("name"),
    // Permission-gated definer function: the only path to member emails.
    supabase.rpc("get_member_emails", {
      p_organization_id: ctx.organization.id,
    }),
    // Whole-collection signal for onboarding — must not be page-scoped.
    supabase
      .from("organization_memberships")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", ctx.organization.id)
      .neq("id", ctx.membershipId)
      .in("status", ["invited", "active"]),
  ]);

  const emailByMembership = new Map(
    (emails ?? []).map((e) => [e.membership_id, e.email]),
  );

  const { term } = await getTerminology(ctx.organization.id);
  const memberTerm = term("learner"); // display flavor only; canonical entities unchanged

  const othersCount = othersTotal ?? 0;
  const meta = pageMeta(page, memberTotal ?? 0);

  return (
    <div className="space-y-8" {...tourState({ others: othersCount })}>
      <PageHeader
        eyebrow="Organization"
        title="Members"
        description={`Memberships, invitations, and role assignments. ${memberTerm.plural} and staff both live here.`}
      />

      <InvitePanel orgSlug={orgSlug} />

      <section>
        <SectionHeader
          title="All members"
          count={memberTotal ?? 0}
          description="Suspending removes access immediately; removal is permanent history."
        />
        <Panel tone="outlined" className="mt-2.5">
          <ul className="divide-y divide-border-subtle">
            {(memberships ?? []).map((m) => (
              <MemberRow
                key={m.id}
                orgSlug={orgSlug}
                membership={{
                  id: m.id,
                  status: m.status,
                  invitedEmail: emailByMembership.get(m.id) ?? m.invited_email,
                  userId: m.user_id,
                  assignments: m.organization_member_roles.map((a) => ({
                    id: a.id,
                    academyId: a.academy_id,
                    roleName: a.organization_roles?.name ?? "—",
                    roleKey: a.organization_roles?.key ?? "",
                  })),
                }}
                roles={(roles ?? []).map((r) => ({
                  id: r.id,
                  name: r.name,
                  key: r.key,
                }))}
                academies={(academies ?? []).map((a) => ({
                  id: a.id,
                  name: a.name,
                }))}
                isSelf={m.id === ctx.membershipId}
              />
            ))}
          </ul>
          <Pagination
            meta={meta}
            basePath={`/${orgSlug}/admin/members`}
            searchParams={sp}
            itemLabel="members"
          />
        </Panel>
      </section>
    </div>
  );
}
