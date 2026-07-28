import type { Metadata } from "next";
import Link from "next/link";
import { requireOrgContext, requirePermission } from "@/lib/org-context";
import { getTerminology } from "@/lib/terminology";
import { supabaseServer } from "@/lib/supabase/server";
import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
} from "@/components/ui/primitives";
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

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-h1 text-text-primary">{courseTerm.plural}</h1>
        <p className="text-body-sm text-text-secondary">
          Drafts are editable; published versions are immutable snapshots
          learners experience.
        </p>
      </header>

      <CreateCoursePanel orgSlug={orgSlug} termSingular={courseTerm.singular} />

      <Card>
        <CardHeader
          title={`All ${courseTerm.plural.toLowerCase()} (${courses?.length ?? 0})`}
        />
        {courses?.length ? (
          <ul className="divide-y divide-border-subtle">
            {courses.map((course) => (
              <li key={course.id}>
                <Link
                  href={`/${orgSlug}/admin/courses/${course.id}`}
                  className="flex flex-wrap items-center gap-3 px-5 py-3.5 transition-colors hover:bg-surface-interactive"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body-sm font-medium text-text-primary">
                      {course.title}
                    </span>
                    <span className="font-mono text-caption text-text-faint">
                      /{course.slug}
                    </span>
                  </span>
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
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            title={`No ${courseTerm.plural.toLowerCase()} yet`}
            description={`Create the first ${courseTerm.singular.toLowerCase()} draft to get started.`}
          />
        )}
      </Card>
    </div>
  );
}
