import type { Metadata } from "next";
import { requireOrgContext, requirePermission } from "@/lib/org-context";
import { getTerminology } from "@/lib/terminology";
import { supabaseServer } from "@/lib/supabase/server";
import { Badge, EmptyState } from "@/components/ui/primitives";
import {
  DataRow,
  PageHeader,
  Panel,
  SectionHeader,
} from "@/components/ui/layout";
import { CreateCoursePanel } from "./courses-ui";

export const metadata: Metadata = { title: "Courses" };

export default async function CoursesPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const ctx = await requireOrgContext(orgSlug);
  requirePermission(ctx, "content.view_draft");
  const { term } = await getTerminology(ctx.organization.id);
  const courseTerm = term("course");

  const supabase = await supabaseServer();
  const { data: courses } = await supabase
    .from("courses")
    .select(
      "id, title, slug, status, updated_at, current_published_version_id, course_versions!courses_current_published_version_fk(version_number)",
    )
    .eq("organization_id", ctx.organization.id)
    .neq("status", "archived")
    .order("created_at");

  const published =
    courses?.filter((c) => c.current_published_version_id).length ?? 0;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Knowledge"
        title={courseTerm.plural}
        description="Drafts are editable; published versions are immutable snapshots learners experience."
      />

      <CreateCoursePanel orgSlug={orgSlug} termSingular={courseTerm.singular} />

      <section>
        <SectionHeader
          title={`All ${courseTerm.plural.toLowerCase()}`}
          count={courses?.length ?? 0}
          description={
            courses?.length
              ? `${published} published · ${(courses.length ?? 0) - published} draft only`
              : undefined
          }
        />
        <Panel tone="outlined" className="mt-2.5">
          {courses?.length ? (
            <ul className="p-1.5">
              {courses.map((course) => (
                <li key={course.id}>
                  <DataRow
                    href={`/${orgSlug}/admin/courses/${course.id}`}
                    title={course.title}
                    meta={<span className="font-mono">/{course.slug}</span>}
                    trailing={
                      <Badge
                        tone={
                          course.current_published_version_id
                            ? "positive"
                            : "neutral"
                        }
                      >
                        {course.current_published_version_id
                          ? `Published v${(course.course_versions as { version_number: number } | null)?.version_number ?? "?"}`
                          : "Draft only"}
                      </Badge>
                    }
                  />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              title={`No ${courseTerm.plural.toLowerCase()} yet`}
              description={`Create the first ${courseTerm.singular.toLowerCase()} draft to get started. Drafts stay private until you publish a version.`}
            />
          )}
        </Panel>
      </section>
    </div>
  );
}
