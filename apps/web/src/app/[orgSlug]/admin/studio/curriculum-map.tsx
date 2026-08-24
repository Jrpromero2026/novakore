import Link from "next/link";
import type { CurriculumMapCourse, CurriculumMapData } from "@/lib/data/studio";
import { Badge, EmptyState } from "@/components/ui/primitives";

/**
 * Curriculum map (replaces the knowledge graph).
 *
 * The organization's knowledge as ordered structure: each journey lists its
 * courses in their real sequence, annotated with real prerequisites and real
 * row counts. The graph's honesty rule is unchanged — nothing shown here is
 * inferred — but the grain is one row per course, so the view stays readable
 * whether an org has three courses or three hundred lessons. Content that
 * learners can never be routed to (courses on no journey, evaluations
 * attached to no lesson) is called out instead of drawn as a stray dot.
 */

function CourseRow({
  course,
  index,
  orgSlug,
  labels,
}: {
  course: CurriculumMapCourse;
  index: number | null;
  orgSlug: string;
  labels: Labels;
}) {
  const counts = [
    `${course.moduleCount} ${course.moduleCount === 1 ? labels.module : labels.modules}`,
    `${course.lessonCount} ${course.lessonCount === 1 ? labels.lesson : labels.lessons}`,
    `${course.assessmentCount} ${course.assessmentCount === 1 ? labels.assessment : labels.assessments}`,
    ...(course.practicalCount > 0
      ? [
          `${course.practicalCount} practical${course.practicalCount === 1 ? "" : "s"}`,
        ]
      : []),
  ].join(" · ");

  return (
    <li>
      <Link
        href={`/${orgSlug}/admin/courses/${course.id}`}
        className="flex items-start gap-3 rounded-md px-3 py-2.5 transition-colors hover:bg-surface-interactive"
      >
        {index !== null ? (
          <span
            aria-hidden
            className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[11px] font-semibold tabular-nums text-accent"
          >
            {index + 1}
          </span>
        ) : null}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-body-sm font-medium text-text-primary">
            {course.title}
          </span>
          <span className="block text-caption text-text-muted">
            {counts}
            {course.requires.length > 0
              ? ` — unlocks after ${course.requires.join(", ")}`
              : ""}
          </span>
        </span>
        <Badge tone={course.published ? "positive" : "neutral"}>
          {course.published ? "live" : "draft"}
        </Badge>
      </Link>
    </li>
  );
}

interface Labels {
  journey: string;
  journeys: string;
  course: string;
  courses: string;
  module: string;
  modules: string;
  lesson: string;
  lessons: string;
  assessment: string;
  assessments: string;
}

export function CurriculumMap({
  data,
  orgSlug,
  labels,
}: {
  data: CurriculumMapData;
  orgSlug: string;
  labels: Labels;
}) {
  const empty =
    data.journeys.length === 0 && data.unattachedCourses.length === 0;
  if (empty) {
    return (
      <EmptyState
        title="Nothing to map yet"
        description={`The map appears once ${labels.journeys.toLowerCase()} and ${labels.courses.toLowerCase()} exist — every row is a real relationship.`}
      />
    );
  }

  return (
    <div className="space-y-5 px-5 pb-5">
      {data.journeys.map((journey) => (
        <section key={journey.id}>
          <div className="mb-1 flex items-baseline gap-2">
            <Link
              href={`/${orgSlug}/admin/studio/paths/${journey.id}`}
              className="truncate text-body font-semibold text-text-primary hover:text-accent"
            >
              {journey.title}
            </Link>
            <span className="text-caption uppercase tracking-[var(--tracking-caps)] text-text-muted">
              {labels.journey}
            </span>
            {journey.status !== "active" ? (
              <Badge tone="neutral">{journey.status}</Badge>
            ) : null}
            <span className="ml-auto text-caption tabular-nums text-text-muted">
              {journey.courses.length}{" "}
              {journey.courses.length === 1 ? labels.course : labels.courses}
            </span>
          </div>
          {journey.courses.length === 0 ? (
            <p className="px-3 py-2 text-body-sm text-text-muted">
              No {labels.courses.toLowerCase()} on this{" "}
              {labels.journey.toLowerCase()} yet.
            </p>
          ) : (
            <ul className="divide-y divide-border-subtle rounded-md border border-border-subtle">
              {journey.courses.map((course, index) => (
                <CourseRow
                  key={course.id}
                  course={course}
                  index={index}
                  orgSlug={orgSlug}
                  labels={labels}
                />
              ))}
            </ul>
          )}
        </section>
      ))}

      {data.unattachedCourses.length > 0 ? (
        <section>
          <div className="mb-1 flex items-baseline gap-2">
            <span className="text-body font-semibold text-text-primary">
              Not on any {labels.journey.toLowerCase()}
            </span>
            <span className="rounded-full bg-warning/10 px-1.5 text-[10px] font-medium text-warning">
              unreachable by enrollment
            </span>
          </div>
          <ul className="divide-y divide-border-subtle rounded-md border border-border-subtle">
            {data.unattachedCourses.map((course) => (
              <CourseRow
                key={course.id}
                course={course}
                index={null}
                orgSlug={orgSlug}
                labels={labels}
              />
            ))}
          </ul>
        </section>
      ) : null}

      {data.unattachedAssessmentCount > 0 ? (
        <p className="text-caption text-text-muted">
          {data.unattachedAssessmentCount}{" "}
          {data.unattachedAssessmentCount === 1
            ? labels.assessment
            : labels.assessments}{" "}
          {data.unattachedAssessmentCount === 1 ? "is" : "are"} not attached to
          any {labels.lesson.toLowerCase()} —{" "}
          <Link
            href={`/${orgSlug}/admin/assessments`}
            className="text-accent hover:text-accent-hover"
          >
            review them
          </Link>
          .
        </p>
      ) : null}
    </div>
  );
}
