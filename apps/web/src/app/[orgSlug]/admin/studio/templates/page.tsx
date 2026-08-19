import type { Metadata } from "next";
import { can, requireOrgContext, requirePermission } from "@/lib/org-context";
import { listTemplates } from "@/lib/data/templates";
import { supabaseServer } from "@/lib/supabase/server";
import { TemplateWorkspace } from "./template-workspace";

export const metadata: Metadata = { title: "Templates · Studio" };

export default async function StudioTemplatesPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const ctx = await requireOrgContext(orgSlug);
  requirePermission(ctx, "content.view_draft");

  const supabase = await supabaseServer();
  const [templates, { data: lessons }] = await Promise.all([
    listTemplates(ctx.organization.id),
    supabase
      .from("lessons")
      .select(
        "id, title, courses!lessons_course_id_organization_id_fkey(title)",
      )
      .eq("organization_id", ctx.organization.id)
      .is("archived_at", null)
      .order("title")
      .limit(200),
  ]);

  return (
    <TemplateWorkspace
      orgSlug={orgSlug}
      templates={templates}
      lessons={(lessons ?? []).map((l) => ({
        id: l.id,
        title: l.title,
        courseTitle:
          (l.courses as { title: string } | null)?.title ?? "Unassigned",
      }))}
      canManage={can(ctx, "library.manage")}
      canAuthor={can(ctx, "content.author")}
    />
  );
}
