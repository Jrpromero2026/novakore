import type { Metadata } from "next";
import { can, requireOrgContext, requirePermission } from "@/lib/org-context";
import { getTerminology } from "@/lib/terminology";
import { getCredentialAdminData } from "@/lib/data/assessments";
import { supabaseServer } from "@/lib/supabase/server";
import { CredentialsAdmin } from "./credentials-ui";

export const metadata: Metadata = { title: "Credentials" };

export default async function CredentialsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const ctx = await requireOrgContext(orgSlug);
  requirePermission(ctx, "certificates.manage");
  const { term } = await getTerminology(ctx.organization.id);
  const data = await getCredentialAdminData(ctx.organization.id);

  // source picker: published courses, active paths, active assignments
  const supabase = await supabaseServer();
  const [{ data: courses }, { data: paths }, { data: assignments }] =
    await Promise.all([
      supabase
        .from("courses")
        .select("id, title")
        .eq("organization_id", ctx.organization.id)
        .eq("status", "published")
        .order("title"),
      supabase
        .from("learning_paths")
        .select("id, title")
        .eq("organization_id", ctx.organization.id)
        .eq("status", "active")
        .order("title"),
      supabase
        .from("assessment_assignments")
        .select(
          "id, status, lessons!assessment_assignments_lesson_id_organization_id_fkey(title)",
        )
        .eq("organization_id", ctx.organization.id)
        .eq("status", "active"),
    ]);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-h1 text-text-primary">
          {term("certificate").plural}
        </h1>
        <p className="text-body-sm text-text-secondary">
          Templates define the look; certificate rules define eligibility;
          issued credentials are immutable evidence with public verification
          codes.
        </p>
      </header>

      <CredentialsAdmin
        orgSlug={orgSlug}
        data={data}
        canRevoke={can(ctx, "credential.revoke")}
        sources={[
          ...(courses ?? []).map((c) => ({
            value: `course:${c.id}`,
            label: `${term("course").singular}: ${c.title}`,
          })),
          ...(paths ?? []).map((p) => ({
            value: `learning_path:${p.id}`,
            label: `${term("learning_path").singular}: ${p.title}`,
          })),
          ...(assignments ?? []).map((a) => ({
            value: `assessment_assignment:${a.id}`,
            label: `${term("assessment").singular}: ${
              (a.lessons as unknown as { title: string } | null)?.title ?? a.id
            }`,
          })),
        ]}
      />
    </div>
  );
}
