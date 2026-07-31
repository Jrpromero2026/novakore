import type { Metadata } from "next";
import { can, requireOrgContext } from "@/lib/org-context";
import { getTerminology } from "@/lib/terminology";
import { supabaseServer } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui/primitives";
import { PageHeader, Panel, SectionHeader } from "@/components/ui/layout";
import { AcademyRow, CreateAcademyPanel } from "./academies-ui";

export const metadata: Metadata = { title: "Academies" };

export default async function AcademiesPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const ctx = await requireOrgContext(orgSlug);
  // Members may view the academy list; management is gated per action.

  const supabase = await supabaseServer();
  const { data: academies } = await supabase
    .from("academies")
    .select("id, name, slug, description, status")
    .eq("organization_id", ctx.organization.id)
    .order("status")
    .order("name");

  const { term } = await getTerminology(ctx.organization.id);
  const academyTerm = term("academy");
  const canManageOrgWide = can(ctx, "academy.manage");

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Organization"
        title={academyTerm.plural}
        description={`${academyTerm.plural} group audiences and programs. Learning systems and paths attach here.`}
      />

      {canManageOrgWide ? (
        <CreateAcademyPanel
          orgSlug={orgSlug}
          termSingular={academyTerm.singular}
        />
      ) : null}

      <section>
        <SectionHeader
          title={`All ${academyTerm.plural.toLowerCase()}`}
          count={academies?.length ?? 0}
        />
        <Panel tone="outlined" className="mt-2.5">
          {academies?.length ? (
            <ul className="divide-y divide-border-subtle">
              {academies.map((a) => (
                <AcademyRow
                  key={a.id}
                  orgSlug={orgSlug}
                  academy={a}
                  canManage={can(ctx, "academy.manage", { academyId: a.id })}
                />
              ))}
            </ul>
          ) : (
            <EmptyState
              title={`No ${academyTerm.plural.toLowerCase()} yet`}
              description={
                canManageOrgWide
                  ? `Create the first ${academyTerm.singular.toLowerCase()} to group your audiences and programs.`
                  : "An administrator will set these up."
              }
            />
          )}
        </Panel>
      </section>
    </div>
  );
}
