import type { Metadata } from "next";
import { can, requireOrgContext } from "@/lib/org-context";
import { getTerminology } from "@/lib/terminology";
import { supabaseServer } from "@/lib/supabase/server";
import { Card, CardHeader, EmptyState } from "@/components/ui/primitives";
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
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight text-text">
          {academyTerm.plural}
        </h1>
        <p className="text-sm text-text-muted">
          {academyTerm.plural} group audiences and programs. Learning systems
          and paths attach here in later phases.
        </p>
      </header>

      {canManageOrgWide ? (
        <CreateAcademyPanel
          orgSlug={orgSlug}
          termSingular={academyTerm.singular}
        />
      ) : null}

      <Card>
        <CardHeader
          title={`All ${academyTerm.plural.toLowerCase()} (${academies?.length ?? 0})`}
        />
        {academies?.length ? (
          <ul className="divide-y divide-border">
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
                ? `Create the first ${academyTerm.singular.toLowerCase()} to get started.`
                : "An administrator will set these up."
            }
          />
        )}
      </Card>
    </div>
  );
}
