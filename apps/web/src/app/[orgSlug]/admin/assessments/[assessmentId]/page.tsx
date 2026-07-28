import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { can, requireOrgContext, requirePermission } from "@/lib/org-context";
import { getTerminology } from "@/lib/terminology";
import { getAssessmentDetail } from "@/lib/data/assessments";
import { supabaseServer } from "@/lib/supabase/server";
import { AssessmentEditor } from "./assessment-editor";

export const metadata: Metadata = { title: "Assessment editor" };

export default async function AssessmentEditorPage({
  params,
}: {
  params: Promise<{ orgSlug: string; assessmentId: string }>;
}) {
  const { orgSlug, assessmentId } = await params;
  const ctx = await requireOrgContext(orgSlug);
  requirePermission(ctx, "content.view_draft");
  const { term } = await getTerminology(ctx.organization.id);

  const detail = await getAssessmentDetail(ctx.organization.id, assessmentId);
  if (!detail) notFound();

  // lesson picker for the assignment panel (staff-visible drafts)
  const supabase = await supabaseServer();
  const { data: lessons } = await supabase
    .from("lessons")
    .select("id, title, courses!lessons_course_id_organization_id_fkey(title)")
    .eq("organization_id", ctx.organization.id)
    .is("archived_at", null)
    .order("title")
    .limit(200);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <p
          className="text-caption uppercase text-text-muted"
          style={{ letterSpacing: "var(--tracking-caps)" }}
        >
          <Link
            href={`/${orgSlug}/admin/assessments`}
            className="hover:text-text-primary"
          >
            {term("assessment").plural}
          </Link>{" "}
          / editor
        </p>
        <h1 className="text-h1 text-text-primary">{detail.title}</h1>
      </header>

      <AssessmentEditor
        orgSlug={orgSlug}
        detail={detail}
        canPublish={can(ctx, "assessment.publish")}
        canAssign={can(ctx, "assessment.assign")}
        lessons={(lessons ?? []).map((l) => ({
          id: l.id,
          title: l.title,
          courseTitle:
            (l.courses as unknown as { title: string } | null)?.title ?? "",
        }))}
        lessonTerm={term("lesson").singular}
      />
    </div>
  );
}
