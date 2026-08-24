"use client";

import Link from "next/link";
import { useState } from "react";
import type {
  CurriculumMapCourse,
  CurriculumMapData,
  CurriculumMapModule,
} from "@/lib/data/studio";
import { Badge, EmptyState, cx } from "@/components/ui/primitives";

/**
 * The Builder: the academy as one expandable, top-down hierarchy —
 * journey → course → module → lesson — in the middle of the page, with a
 * create/open affordance at every level.
 *
 * Every row is a real database row and every count is a count of real rows
 * (the honesty rule the knowledge graph carried, at a grain that stays
 * usable at any content size: courses start collapsed, modules reveal
 * lessons on demand). Clicking through lands on the real editing surface —
 * course builder, lesson editor, path canvas.
 */

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

function Chevron({ open }: { open: boolean }) {
  return (
    <span
      aria-hidden
      className={cx(
        "inline-block shrink-0 text-text-muted transition-transform duration-[var(--motion-fast)]",
        open ? "rotate-90" : "",
      )}
    >
      ›
    </span>
  );
}

function ModuleRow({
  module,
  courseId,
  orgSlug,
  labels,
}: {
  module: CurriculumMapModule;
  courseId: string;
  orgSlug: string;
  labels: Labels;
}) {
  const [open, setOpen] = useState(false);
  return (
    <li>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-surface-interactive"
        >
          <Chevron open={open} />
          <span className="min-w-0 flex-1 truncate text-body-sm text-text-primary">
            {module.title}
          </span>
          <span className="shrink-0 text-caption tabular-nums text-text-muted">
            {module.lessons.length}{" "}
            {module.lessons.length === 1 ? labels.lesson : labels.lessons}
          </span>
        </button>
      </div>
      {open ? (
        <ul className="ml-5 border-l border-border-subtle pl-3">
          {module.lessons.length === 0 ? (
            <li className="px-2 py-1 text-caption text-text-muted">
              No {labels.lessons.toLowerCase()} yet — add them in the{" "}
              {labels.course.toLowerCase()} builder.
            </li>
          ) : (
            module.lessons.map((lesson) => (
              <li key={lesson.id}>
                <Link
                  href={`/${orgSlug}/admin/courses/${courseId}/lessons/${lesson.id}`}
                  className="flex items-center gap-2 rounded-md px-2 py-1 transition-colors hover:bg-surface-interactive"
                >
                  <span className="min-w-0 flex-1 truncate text-body-sm text-text-secondary">
                    {lesson.title}
                  </span>
                  {lesson.estimatedMinutes ? (
                    <span className="shrink-0 text-caption tabular-nums text-text-muted">
                      {lesson.estimatedMinutes}m
                    </span>
                  ) : null}
                  <Badge
                    tone={
                      lesson.status === "published" ? "positive" : "neutral"
                    }
                  >
                    {lesson.status === "published" ? "live" : lesson.status}
                  </Badge>
                </Link>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </li>
  );
}

function CourseNode({
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
  const [open, setOpen] = useState(false);
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
      <div className="flex items-start gap-2 rounded-md px-2 py-2 transition-colors hover:bg-surface-interactive">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-label={`${open ? "Collapse" : "Expand"} ${course.title}`}
          className="mt-1 rounded p-0.5"
        >
          <Chevron open={open} />
        </button>
        {index !== null ? (
          <span
            aria-hidden
            className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[11px] font-semibold tabular-nums text-accent"
          >
            {index + 1}
          </span>
        ) : null}
        <span className="min-w-0 flex-1">
          <Link
            href={`/${orgSlug}/admin/courses/${course.id}`}
            className="block truncate text-body-sm font-medium text-text-primary hover:text-accent"
          >
            {course.title}
          </Link>
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
      </div>
      {open ? (
        <ul className="ml-5 space-y-0.5 border-l border-border-subtle pl-3">
          {course.modules.length === 0 ? (
            <li className="px-2 py-1 text-caption text-text-muted">
              No {labels.modules.toLowerCase()} yet.{" "}
              <Link
                href={`/${orgSlug}/admin/courses/${course.id}`}
                className="text-accent hover:text-accent-hover"
              >
                Open the {labels.course.toLowerCase()} builder
              </Link>{" "}
              to add the first.
            </li>
          ) : (
            course.modules.map((module) => (
              <ModuleRow
                key={module.id}
                module={module}
                courseId={course.id}
                orgSlug={orgSlug}
                labels={labels}
              />
            ))
          )}
        </ul>
      ) : null}
    </li>
  );
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
        title="Nothing to build from yet"
        description={`Create a ${labels.journey.toLowerCase()} or a ${labels.course.toLowerCase()} and the hierarchy grows from here.`}
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
            <span
              className="text-caption uppercase text-text-muted"
              style={{ letterSpacing: "var(--tracking-caps)" }}
            >
              {labels.journey}
            </span>
            {journey.status !== "active" ? (
              <Badge tone="neutral">{journey.status}</Badge>
            ) : null}
            <span className="ml-auto shrink-0 text-caption tabular-nums text-text-muted">
              {journey.courses.length}{" "}
              {journey.courses.length === 1 ? labels.course : labels.courses}
            </span>
          </div>
          {journey.courses.length === 0 ? (
            <p className="px-2 py-2 text-body-sm text-text-muted">
              No {labels.courses.toLowerCase()} on this{" "}
              {labels.journey.toLowerCase()} yet —{" "}
              <Link
                href={`/${orgSlug}/admin/studio/paths/${journey.id}`}
                className="text-accent hover:text-accent-hover"
              >
                open the canvas
              </Link>{" "}
              to attach one.
            </p>
          ) : (
            <ul className="space-y-0.5 rounded-md border border-border-subtle py-1">
              {journey.courses.map((course, index) => (
                <CourseNode
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
          <ul className="space-y-0.5 rounded-md border border-border-subtle py-1">
            {data.unattachedCourses.map((course) => (
              <CourseNode
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

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-caption text-text-muted">
        <Link
          href={`/${orgSlug}/admin/learning/paths`}
          className="text-accent hover:text-accent-hover"
        >
          + New {labels.journey.toLowerCase()}
        </Link>
        <Link
          href={`/${orgSlug}/admin/courses`}
          className="text-accent hover:text-accent-hover"
        >
          + New {labels.course.toLowerCase()}
        </Link>
        <Link
          href={`/${orgSlug}/admin/studio/sources`}
          className="text-accent hover:text-accent-hover"
        >
          + Upload sources
        </Link>
        {data.unattachedAssessmentCount > 0 ? (
          <span>
            {data.unattachedAssessmentCount}{" "}
            {data.unattachedAssessmentCount === 1
              ? labels.assessment
              : labels.assessments}{" "}
            not attached to any {labels.lesson.toLowerCase()} —{" "}
            <Link
              href={`/${orgSlug}/admin/assessments`}
              className="text-accent hover:text-accent-hover"
            >
              review them
            </Link>
          </span>
        ) : null}
      </div>
    </div>
  );
}
