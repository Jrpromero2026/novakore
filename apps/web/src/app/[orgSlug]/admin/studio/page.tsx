import type { Metadata } from "next";
import Link from "next/link";
import { requireOrgContext } from "@/lib/org-context";
import { getTerminology } from "@/lib/terminology";
import { getCurriculumMap, getStudioHome } from "@/lib/data/studio";
import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
} from "@/components/ui/primitives";
import { StudioSessionPing } from "./session-ping";
import { CurriculumMap } from "./curriculum-map";

export const metadata: Metadata = { title: "Learning Studio" };

export default async function StudioHomePage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const ctx = await requireOrgContext(orgSlug);
  const { term } = await getTerminology(ctx.organization.id);
  const [home, map] = await Promise.all([
    getStudioHome(ctx.organization.id),
    getCurriculumMap(ctx.organization.id),
  ]);

  return (
    <div className="space-y-5">
      <Card className="nk-fade-up">
        <CardHeader
          title="Curriculum map"
          description="Your knowledge as structure — sequences, prerequisites, and counts, every row a real relationship."
        />
        <CurriculumMap
          data={map}
          orgSlug={orgSlug}
          labels={{
            journey: term("learning_path").singular,
            journeys: term("learning_path").plural,
            course: term("course").singular,
            courses: term("course").plural,
            module: term("module").singular,
            modules: term("module").plural,
            lesson: term("lesson").singular,
            lessons: term("lesson").plural,
            assessment: term("assessment").singular,
            assessments: term("assessment").plural,
          }}
        />
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <StudioSessionPing
          orgSlug={orgSlug}
          organizationId={ctx.organization.id}
        />

        <Card>
          <CardHeader
            title="Recent drafts"
            description={`Pick up where authoring left off.`}
          />
          {home.recentLessons.length === 0 ? (
            <EmptyState
              title="Nothing in progress"
              description={`Create a ${term("course").singular.toLowerCase()} or open the AI workspace to start.`}
            />
          ) : (
            <ul className="divide-y divide-border-subtle">
              {home.recentLessons.map((lesson) => (
                <li key={lesson.id}>
                  <Link
                    href={`/${orgSlug}/admin/courses/${lesson.courseId}/lessons/${lesson.id}`}
                    className="flex items-center gap-3 px-5 py-2.5 transition-colors hover:bg-surface-interactive"
                  >
                    <span className="min-w-0 flex-1 truncate text-body-sm text-text-primary">
                      {lesson.title}
                    </span>
                    <span className="text-caption text-text-muted">
                      {new Date(lesson.updatedAt).toLocaleDateString()}
                    </span>
                    <Badge
                      tone={
                        lesson.status === "published" ? "positive" : "neutral"
                      }
                    >
                      {lesson.status}
                    </Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Needs review"
            description="Open review requests across drafts."
          />
          {home.openReviews.length === 0 ? (
            <EmptyState
              title="Review queue is clear"
              description="Requested reviews appear here."
            />
          ) : (
            <ul className="divide-y divide-border-subtle">
              {home.openReviews.map((review) => (
                <li key={review.id}>
                  <Link
                    href={`/${orgSlug}/admin/studio/review`}
                    className="flex items-center gap-3 px-5 py-2.5 transition-colors hover:bg-surface-interactive"
                  >
                    <span className="min-w-0 flex-1 truncate text-body-sm text-text-primary">
                      {review.subjectType} · {review.note ?? "review requested"}
                    </span>
                    <Badge
                      tone={review.status === "open" ? "warning" : "neutral"}
                    >
                      {review.status.replace(/_/g, " ")}
                    </Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title={`${term("course").plural} in motion`} />
          <ul className="divide-y divide-border-subtle">
            {home.draftCourses.map((course) => (
              <li key={course.id}>
                <Link
                  href={`/${orgSlug}/admin/courses/${course.id}`}
                  className="flex items-center gap-3 px-5 py-2.5 transition-colors hover:bg-surface-interactive"
                >
                  <span className="min-w-0 flex-1 truncate text-body-sm text-text-primary">
                    {course.title}
                  </span>
                  <Badge
                    tone={
                      course.status === "published" ? "positive" : "neutral"
                    }
                  >
                    {course.status}
                  </Badge>
                </Link>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader
            title="Latest AI activity"
            description="Every generation is a governed, budgeted draft."
          />
          {home.recentGenerations.length === 0 ? (
            <EmptyState
              title="No generations yet"
              description="The AI workspace drafts outlines, lessons, checks, and more."
            />
          ) : (
            <ul className="divide-y divide-border-subtle">
              {home.recentGenerations.map((generation) => (
                <li
                  key={generation.id}
                  className="flex items-center gap-3 px-5 py-2.5"
                >
                  <span className="min-w-0 flex-1 truncate text-body-sm text-text-primary">
                    {generation.operation.replace(/_/g, " ")}
                  </span>
                  <Badge
                    tone={
                      generation.status === "completed" ||
                      generation.status === "accepted"
                        ? "positive"
                        : generation.status === "failed"
                          ? "danger"
                          : "neutral"
                    }
                  >
                    {generation.status}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
