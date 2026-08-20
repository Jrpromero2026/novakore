import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { can, requireOrgContext, requirePermission } from "@/lib/org-context";
import { getTerminology } from "@/lib/terminology";
import { supabaseServer } from "@/lib/supabase/server";
import { Badge, Card, CardHeader } from "@/components/ui/primitives";
import { Alert } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/layout";
import { tourState } from "@/lib/onboarding/targets";
import { CourseStructurePanel, PublishCoursePanel } from "./course-builder";

export const metadata: Metadata = { title: "Course builder" };

export default async function CourseBuilderPage({
  params,
}: {
  params: Promise<{ orgSlug: string; courseId: string }>;
}) {
  const { orgSlug, courseId } = await params;
  const ctx = await requireOrgContext(orgSlug);
  requirePermission(ctx, "content.view_draft");
  const { term } = await getTerminology(ctx.organization.id);

  const supabase = await supabaseServer();
  const [
    { data: course },
    { data: modules },
    { data: lessons },
    { data: versions },
  ] = await Promise.all([
    supabase
      .from("courses")
      .select("id, title, slug, status, summary, current_published_version_id")
      .eq("id", courseId)
      .eq("organization_id", ctx.organization.id)
      .maybeSingle(),
    supabase
      .from("modules")
      .select("id, title, position")
      .eq("course_id", courseId)
      .is("archived_at", null)
      .order("position"),
    supabase
      .from("lessons")
      .select(
        "id, module_id, title, position, required, status, current_published_version_id, lesson_versions!lessons_current_published_version_fk(version_number)",
      )
      .eq("course_id", courseId)
      .is("archived_at", null)
      .order("position"),
    supabase
      .from("course_versions")
      .select(
        "id, version_number, published_at, published_by, supersedes_version_id",
      )
      .eq("course_id", courseId)
      .order("version_number", { ascending: false }),
  ]);
  if (!course) notFound();

  const lessonViews = (lessons ?? []).map((l) => ({
    id: l.id,
    moduleId: l.module_id,
    title: l.title,
    position: l.position,
    required: l.required,
    publishedVersionNumber:
      (l.lesson_versions as { version_number: number } | null)
        ?.version_number ?? null,
  }));
  const unpublishedCount = lessonViews.filter(
    (l) => l.publishedVersionNumber === null,
  ).length;
  const currentVersion = versions?.find(
    (v) => v.id === course.current_published_version_id,
  );

  return (
    <div
      className="space-y-6"
      {...tourState({
        modules: (modules ?? []).length,
        lessons: lessonViews.length,
        published: (versions ?? []).length,
      })}
    >
      <PageHeader
        // The leaf names the ACTIVITY, not the course: the title is already
        // the heading directly beneath, and a trail that ends by repeating it
        // spends the reader's attention without adding orientation.
        trail={[{ label: "Builder" }]}
        title={course.title}
        description="Draft is editable · published versions are immutable"
        actions={
          <>
            <Badge tone={currentVersion ? "positive" : "neutral"}>
              {currentVersion
                ? `Live: v${currentVersion.version_number}`
                : "Never published"}
            </Badge>
            {unpublishedCount > 0 ? (
              <Badge tone="warning">
                {unpublishedCount} unpublished{" "}
                {term("lesson").plural.toLowerCase()}
              </Badge>
            ) : null}
          </>
        }
      />

      <CourseStructurePanel
        orgSlug={orgSlug}
        courseId={courseId}
        modules={(modules ?? []).map((m) => ({
          id: m.id,
          title: m.title,
          position: m.position,
        }))}
        lessons={lessonViews}
        moduleTerm={term("module").singular}
        lessonTerm={term("lesson").singular}
      />

      {can(ctx, "content.publish") ? (
        <PublishCoursePanel
          orgSlug={orgSlug}
          courseId={courseId}
          courseTitle={course.title}
          modules={(modules ?? []).map((m) => ({
            id: m.id,
            title: m.title,
            position: m.position,
          }))}
          lessons={lessonViews}
          nextVersionNumber={(versions?.[0]?.version_number ?? 0) + 1}
        />
      ) : (
        <Alert tone="info" title="Publishing">
          You can author drafts; publishing requires the publish permission
          (separation of duties).
        </Alert>
      )}

      <Card>
        <CardHeader
          title="Version history"
          description="Published versions are immutable evidence; each pins exact lesson versions."
        />
        {versions?.length ? (
          <ul className="divide-y divide-border-subtle">
            {versions.map((v) => (
              <li
                key={v.id}
                className="flex flex-wrap items-center gap-3 px-5 py-3"
              >
                <span className="text-body-sm font-medium tabular-nums text-text-primary">
                  Version {v.version_number}
                </span>
                <span className="text-caption text-text-muted">
                  Published {new Date(v.published_at).toLocaleString()}
                </span>
                {v.id === course.current_published_version_id ? (
                  <Badge tone="positive">Current</Badge>
                ) : (
                  <Badge tone="neutral">Superseded</Badge>
                )}
                <Link
                  href={`/${orgSlug}/admin/courses/${courseId}/versions/${v.id}`}
                  className="ml-auto text-body-sm text-accent hover:text-accent-hover"
                >
                  Inspect
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-5 py-4 text-body-sm text-text-muted">
            Nothing published yet. Publish every{" "}
            {term("lesson").singular.toLowerCase()} first, then publish the{" "}
            {term("course").singular.toLowerCase()}.
          </p>
        )}
      </Card>
    </div>
  );
}
