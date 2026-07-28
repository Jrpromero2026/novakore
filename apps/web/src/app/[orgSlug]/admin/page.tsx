import type { Metadata } from "next";
import { can, requireOrgContext } from "@/lib/org-context";
import { getTerminology } from "@/lib/terminology";
import { supabaseServer } from "@/lib/supabase/server";
import { Badge, Card, CardHeader } from "@/components/ui/primitives";
import { OrgNameForm } from "./org-name-form";

export const metadata: Metadata = { title: "Overview" };

export default async function OrgOverviewPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const ctx = await requireOrgContext(orgSlug);
  const supabase = await supabaseServer();
  const { term } = await getTerminology(ctx.organization.id);

  const [{ count: academyCount }, { data: members }] = await Promise.all([
    supabase
      .from("academies")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", ctx.organization.id)
      .neq("status", "archived"),
    can(ctx, "org.members.manage")
      ? supabase
          .from("organization_memberships")
          .select("status")
          .eq("organization_id", ctx.organization.id)
      : Promise.resolve({ data: null }),
  ]);

  const memberCounts = members
    ? {
        active: members.filter((m) => m.status === "active").length,
        invited: members.filter((m) => m.status === "invited").length,
        suspended: members.filter((m) => m.status === "suspended").length,
      }
    : null;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight text-text">
          {ctx.organization.name}
        </h1>
        <p className="text-sm text-text-muted">
          /{ctx.organization.slug} · {ctx.organization.status}
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader title={term("academy").plural} />
          <div className="px-5 py-4">
            <p className="text-3xl font-semibold tracking-tight text-text">
              {academyCount ?? 0}
            </p>
            <p className="mt-1 text-xs text-text-muted">
              active {term("academy").plural.toLowerCase()}
            </p>
          </div>
        </Card>

        {memberCounts ? (
          <Card>
            <CardHeader title="Members" />
            <div className="flex items-end gap-6 px-5 py-4">
              <div>
                <p className="text-3xl font-semibold tracking-tight text-text">
                  {memberCounts.active}
                </p>
                <p className="mt-1 text-xs text-text-muted">active</p>
              </div>
              <div className="flex gap-2 pb-1">
                {memberCounts.invited > 0 ? (
                  <Badge tone="accent">{memberCounts.invited} invited</Badge>
                ) : null}
                {memberCounts.suspended > 0 ? (
                  <Badge tone="warning">
                    {memberCounts.suspended} suspended
                  </Badge>
                ) : null}
              </div>
            </div>
          </Card>
        ) : null}
      </div>

      {can(ctx, "org.manage") ? (
        <Card>
          <CardHeader
            title="Organization profile"
            description="The slug is permanent; contact NovaKore to change it."
          />
          <div className="px-5 py-4">
            <OrgNameForm
              orgSlug={orgSlug}
              currentName={ctx.organization.name}
            />
          </div>
        </Card>
      ) : null}
    </div>
  );
}
