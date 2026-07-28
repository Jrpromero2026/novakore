import type { Metadata } from "next";
import { requireOrgContext, requirePermission, can } from "@/lib/org-context";
import { getTerminology } from "@/lib/terminology";
import { supabaseServer } from "@/lib/supabase/server";
import { Card, CardHeader, EmptyState } from "@/components/ui/primitives";
import { CreateEnrollmentPanel, EnrollmentRow } from "./enrollments-ui";

export const metadata: Metadata = { title: "Enrollments" };

export default async function EnrollmentsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const ctx = await requireOrgContext(orgSlug);
  requirePermission(ctx, "enrollment.manage");
  const { term } = await getTerminology(ctx.organization.id);

  const supabase = await supabaseServer();
  const [
    { data: enrollments },
    { data: emails },
    { data: memberships },
    { data: courses },
    { data: paths },
  ] = await Promise.all([
    supabase
      .from("enrollments")
      .select(
        "id, membership_id, target_type, course_id, learning_path_id, pinned_course_version_id, status, source, started_at, completed_at, created_at",
      )
      .eq("organization_id", ctx.organization.id)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase.rpc("get_member_emails", {
      p_organization_id: ctx.organization.id,
    }),
    supabase
      .from("organization_memberships")
      .select("id, status")
      .eq("organization_id", ctx.organization.id)
      .eq("status", "active"),
    supabase
      .from("courses")
      .select("id, title, current_published_version_id")
      .eq("organization_id", ctx.organization.id)
      .not("current_published_version_id", "is", null),
    supabase
      .from("learning_paths")
      .select("id, title")
      .eq("organization_id", ctx.organization.id)
      .eq("status", "active"),
  ]);

  const emailByMembership = new Map(
    (emails ?? []).map((e) => [e.membership_id, e.email]),
  );
  const courseById = new Map((courses ?? []).map((c) => [c.id, c.title]));
  const pathById = new Map((paths ?? []).map((p) => [p.id, p.title]));

  // progress for inspection (lesson rows per enrollment)
  const { data: progressRows } = await supabase
    .from("progress_records")
    .select(
      "enrollment_id, lesson_id, lesson_version_id, status, override_reason",
    )
    .eq("organization_id", ctx.organization.id)
    .not("lesson_id", "is", null);
  const { data: lessonTitles } = await supabase
    .from("lessons")
    .select("id, title")
    .eq("organization_id", ctx.organization.id);
  const lessonTitleById = new Map(
    (lessonTitles ?? []).map((l) => [l.id, l.title]),
  );

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-h1 text-text-primary">Enrollments</h1>
        <p className="text-body-sm text-text-secondary">
          Assignments pin the exact published version at creation (
          {term("learner").plural} never migrate silently).
        </p>
      </header>

      <CreateEnrollmentPanel
        orgSlug={orgSlug}
        members={(memberships ?? []).map((m) => ({
          id: m.id,
          email: emailByMembership.get(m.id) ?? m.id,
        }))}
        courses={(courses ?? []).map((c) => ({ id: c.id, title: c.title }))}
        paths={(paths ?? []).map((p) => ({ id: p.id, title: p.title }))}
        courseTerm={term("course").singular}
        pathTerm={term("learning_path").singular}
      />

      <Card>
        <CardHeader title={`All enrollments (${enrollments?.length ?? 0})`} />
        {enrollments?.length ? (
          <ul className="divide-y divide-border-subtle">
            {enrollments.map((e) => (
              <EnrollmentRow
                key={e.id}
                orgSlug={orgSlug}
                enrollment={{
                  id: e.id,
                  memberEmail:
                    emailByMembership.get(e.membership_id) ?? "member",
                  targetTitle:
                    e.target_type === "course"
                      ? (courseById.get(e.course_id ?? "") ?? "Course")
                      : (pathById.get(e.learning_path_id ?? "") ?? "Path"),
                  targetType: e.target_type,
                  status: e.status,
                  pinned: e.pinned_course_version_id !== null,
                  startedAt: e.started_at,
                  completedAt: e.completed_at,
                }}
                progress={(progressRows ?? [])
                  .filter((p) => p.enrollment_id === e.id)
                  .map((p) => ({
                    lessonId: p.lesson_id!,
                    lessonTitle: lessonTitleById.get(p.lesson_id!) ?? "Lesson",
                    lessonVersionId: p.lesson_version_id,
                    status: p.status,
                    overrideReason: p.override_reason,
                  }))}
                canOverride={can(ctx, "progress.override")}
              />
            ))}
          </ul>
        ) : (
          <EmptyState
            title="No enrollments yet"
            description="Assign a member to a published course or an active path."
          />
        )}
      </Card>
    </div>
  );
}
