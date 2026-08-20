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
import { tourState, tourTarget, TOUR_TARGETS } from "@/lib/onboarding/targets";
import { ContextHelp } from "@/components/onboarding/context-help";
import { StartWalkthroughButton } from "@/components/onboarding/walkthrough";
import { pageMeta, parsePage, rangeFor } from "@/lib/pagination";
import { Pagination } from "@/components/ui/pagination";
import { CreateCoursePanel } from "./courses-ui";

export const metadata: Metadata = { title: "Courses" };

export default async function CoursesPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { orgSlug } = await params;
  const sp = await searchParams;
  const ctx = await requireOrgContext(orgSlug);
  requirePermission(ctx, "content.view_draft");
  const { term } = await getTerminology(ctx.organization.id);
  const courseTerm = term("course");

  const supabase = await supabaseServer();
  const page = parsePage(sp.page);
  const range = rangeFor(page);
  // The page shows one slice, but the header stats and the onboarding signal
  // describe the WHOLE collection — so totals come from counts, never from
  // the length of the current page.
  const [{ data: courses, count: total }, { count: publishedCount }] =
    await Promise.all([
      supabase
        .from("courses")
        .select(
          "id, title, slug, status, updated_at, current_published_version_id, course_versions!courses_current_published_version_fk(version_number)",
          { count: "exact" },
        )
        .eq("organization_id", ctx.organization.id)
        .neq("status", "archived")
        .order("created_at")
        .range(range.from, range.to),
      supabase
        .from("courses")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", ctx.organization.id)
        .neq("status", "archived")
        .not("current_published_version_id", "is", null),
    ]);

  const courseTotal = total ?? 0;
  const published = publishedCount ?? 0;
  const meta = pageMeta(page, courseTotal);

  return (
    <div className="space-y-8" {...tourState({ courses: courseTotal })}>
      <PageHeader
        title={courseTerm.plural}
        description="Drafts are editable; published versions are immutable snapshots learners experience."
      />

      <ContextHelp
        summary={`What is a ${courseTerm.singular}?`}
        className="max-w-2xl"
      >
        A {courseTerm.singular} is a major section of learning inside a{" "}
        {term("learning_path").singular.toLowerCase()}. It contains{" "}
        {term("module").plural.toLowerCase()} and{" "}
        {term("lesson").plural.toLowerCase()}, and is versioned: draft changes
        stay private until you publish, and learners always see exactly the
        version you published.
      </ContextHelp>

      <CreateCoursePanel orgSlug={orgSlug} termSingular={courseTerm.singular} />

      <section>
        <SectionHeader
          title={`All ${courseTerm.plural.toLowerCase()}`}
          count={courseTotal}
          description={
            courseTotal
              ? `${published} published · ${courseTotal - published} draft only`
              : undefined
          }
        />
        <div className="mt-2.5" {...tourTarget(TOUR_TARGETS.courseList)}>
          <Panel tone="outlined">
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
                description={`A ${courseTerm.singular.toLowerCase()} is a major section of learning — for example "Foundations of Coaching". Create the first draft above; it stays private until you publish a version.`}
                action={
                  <StartWalkthroughButton
                    walkthroughId="create-program"
                    className="nk-press rounded-md bg-accent px-3.5 py-2 text-sm font-medium text-accent-contrast hover:bg-accent-hover"
                  >
                    Show me
                  </StartWalkthroughButton>
                }
              />
            )}
            <Pagination
              meta={meta}
              basePath={`/${orgSlug}/admin/courses`}
              searchParams={sp}
              itemLabel={courseTerm.plural.toLowerCase()}
            />
          </Panel>
        </div>
      </section>
    </div>
  );
}
