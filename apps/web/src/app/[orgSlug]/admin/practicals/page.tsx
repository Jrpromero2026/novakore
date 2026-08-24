import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/layout";
import { requireOrgContext, requirePermission } from "@/lib/org-context";
import { getPracticalWorkbench } from "@/lib/data/practicals";
import { PracticalsWorkbench } from "./practicals-ui";

export const metadata: Metadata = { title: "Practicals" };

export default async function PracticalsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const ctx = await requireOrgContext(orgSlug);
  requirePermission(ctx, "assessment.grade");
  const rows = await getPracticalWorkbench(ctx.organization.id);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Practicals"
        description="Observed practical sign-offs and terminal defenses. Every record carries the evaluator's identity; evaluators can never record their own. Recorded results are immutable — a correction is a new record."
      />
      <PracticalsWorkbench orgSlug={orgSlug} rows={rows} />
    </div>
  );
}
