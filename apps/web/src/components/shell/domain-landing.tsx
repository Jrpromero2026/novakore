import { redirect } from "next/navigation";
import { requireOrgContext } from "@/lib/org-context";
import { getTerminology } from "@/lib/terminology";
import { supabaseServer } from "@/lib/supabase/server";
import { buildDomains, type DomainKey } from "@/lib/navigation/domains";
import { buildBreadcrumbs } from "@/lib/navigation/breadcrumbs";
import { PageShell } from "./page-shell";
import { SectionCard } from "./navigation-card";
import { ContextRail } from "./context-rail";

/**
 * The landing page every domain shares.
 *
 * Extracted rather than copied five times: six domains that each rendered
 * their own arrangement of the same three components would drift within a
 * release, and the whole point of the redesign is that a user meets ONE
 * architectural language everywhere. A domain that genuinely needs a
 * different composition can still render its own page — Home does.
 */
export async function DomainLanding({
  orgSlug,
  domainKey,
  showRail = false,
}: {
  orgSlug: string;
  domainKey: DomainKey;
  /**
   * Only domains that administer the organization itself need to restate
   * which organization that is. Elsewhere it is noise.
   */
  showRail?: boolean;
}) {
  const ctx = await requireOrgContext(orgSlug);
  const terminology = await getTerminology(ctx.organization.id);
  const domains = buildDomains(
    orgSlug,
    [...ctx.orgPermissions] as string[],
    terminology.term,
  );
  const domain = domains.find((d) => d.key === domainKey);

  // No visible sections means no business on the landing page. Not a security
  // decision — every underlying route guards itself — but rendering an empty
  // domain would advertise capabilities the caller does not hold.
  if (!domain) redirect(`/${orgSlug}/admin`);

  let ownerEmail: string | null = null;
  if (showRail) {
    const supabase = await supabaseServer();
    const [{ data: emails }, { data: ownerRows }] = await Promise.all([
      supabase.rpc("get_member_emails", {
        p_organization_id: ctx.organization.id,
      }),
      supabase
        .from("organization_member_roles")
        .select("membership_id, organization_roles!inner(key)")
        .eq("organization_id", ctx.organization.id)
        .eq("organization_roles.key", "organization_owner")
        .limit(1),
    ]);
    const ownerMembershipId = ownerRows?.[0]?.membership_id ?? null;
    ownerEmail = ownerMembershipId
      ? ((emails ?? []).find((r) => r.membership_id === ownerMembershipId)
          ?.email ?? null)
      : null;
  }

  return (
    <PageShell
      crumbs={buildBreadcrumbs(domains, domain.href)}
      title={domain.label}
      description={domain.summary}
      rail={
        showRail ? (
          <ContextRail
            organizationName={ctx.organization.name}
            organizationSlug={ctx.organization.slug}
            status={ctx.organization.status}
            ownerEmail={ownerEmail}
            quickLinks={domain.sections
              .flatMap((s) => s.items)
              .slice(0, 4)
              .map((i) => ({ href: i.href, label: i.label }))}
          />
        ) : undefined
      }
    >
      {domain.sections.map((section) => (
        <SectionCard key={section.label} section={section} />
      ))}
    </PageShell>
  );
}
