import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireOrgContext } from "@/lib/org-context";
import { supabaseServer } from "@/lib/supabase/server";
import { buildDomains } from "@/lib/navigation/domains";
import { buildBreadcrumbs } from "@/lib/navigation/breadcrumbs";
import { PageShell } from "@/components/shell/page-shell";
import { SectionCard } from "@/components/shell/navigation-card";
import { ContextRail } from "@/components/shell/context-rail";

export const metadata: Metadata = { title: "Workspace" };

/**
 * The Workspace domain: how this organization is represented, structured and
 * governed.
 *
 * The first surface built on the new architecture, and the visual baseline
 * for the other five domains. It shows what exists AT this level — three or
 * four cards in grouped sections — rather than every administrative
 * capability the platform has.
 */
export default async function WorkspacePage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const ctx = await requireOrgContext(orgSlug);

  const domains = buildDomains(orgSlug, [...ctx.orgPermissions] as string[]);
  const workspace = domains.find((d) => d.key === "workspace");

  // A caller with no workspace capability has no business on the domain
  // landing page. Not a security decision — every underlying route guards
  // itself — but showing an empty administration surface would advertise
  // capabilities they do not hold.
  if (!workspace) redirect(`/${orgSlug}/admin`);

  const supabase = await supabaseServer();
  const { data: owners } = await supabase.rpc("get_member_emails", {
    p_organization_id: ctx.organization.id,
  });

  // The owner is whoever holds the system owner role. Reported only when the
  // caller may see member emails; otherwise the rail simply omits the block
  // rather than guessing.
  const { data: ownerRows } = await supabase
    .from("organization_member_roles")
    .select("membership_id, organization_roles!inner(key)")
    .eq("organization_id", ctx.organization.id)
    .eq("organization_roles.key", "organization_owner")
    .limit(1);

  const ownerMembershipId = ownerRows?.[0]?.membership_id ?? null;
  const ownerEmail = ownerMembershipId
    ? ((owners ?? []).find((r) => r.membership_id === ownerMembershipId)
        ?.email ?? null)
    : null;

  const crumbs = buildBreadcrumbs(domains, `/${orgSlug}/admin/workspace`);

  return (
    <PageShell
      crumbs={crumbs}
      title="Workspace"
      description={workspace.summary}
      rail={
        <ContextRail
          organizationName={ctx.organization.name}
          organizationSlug={ctx.organization.slug}
          status={ctx.organization.status}
          ownerEmail={ownerEmail}
          quickLinks={workspace.sections
            .flatMap((s) => s.items)
            .slice(0, 4)
            .map((i) => ({ href: i.href, label: i.label }))}
        />
      }
    >
      {workspace.sections.map((section) => (
        <SectionCard key={section.label} section={section} />
      ))}
    </PageShell>
  );
}
