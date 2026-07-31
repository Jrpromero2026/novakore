import type { Metadata } from "next";
import { requireOrgContext, requirePermission } from "@/lib/org-context";
import { getTerminology } from "@/lib/terminology";
import { supabaseServer } from "@/lib/supabase/server";
import { PageHeader, Panel, SectionHeader } from "@/components/ui/layout";
import { InvitePanel, MemberRow } from "./members-ui";

export const metadata: Metadata = { title: "Members" };

export default async function MembersPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const ctx = await requireOrgContext(orgSlug);
  requirePermission(ctx, "org.members.manage");

  const supabase = await supabaseServer();
  const [
    { data: memberships },
    { data: roles },
    { data: academies },
    { data: emails },
  ] = await Promise.all([
    supabase
      .from("organization_memberships")
      .select(
        "id, status, user_id, invited_email, invited_at, accepted_at, organization_member_roles(id, academy_id, organization_roles(id, name, key))",
      )
      .eq("organization_id", ctx.organization.id)
      .neq("status", "removed")
      .order("created_at"),
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
  ]);

  const emailByMembership = new Map(
    (emails ?? []).map((e) => [e.membership_id, e.email]),
  );

  const { term } = await getTerminology(ctx.organization.id);
  const memberTerm = term("learner"); // display flavor only; canonical entities unchanged

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Organization"
        title="Members"
        description={`Memberships, invitations, and role assignments. ${memberTerm.plural} and staff both live here.`}
      />

      <InvitePanel orgSlug={orgSlug} />

      <section>
        <SectionHeader
          title="All members"
          count={memberships?.length ?? 0}
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
        </Panel>
      </section>
    </div>
  );
}
