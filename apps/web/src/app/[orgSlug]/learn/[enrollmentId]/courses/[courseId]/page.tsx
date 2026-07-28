import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrgContext } from "@/lib/org-context";
import { requireUser } from "@/lib/auth";
import { getEnrolledCourse } from "@/lib/data/learning";
import { getTerminology } from "@/lib/terminology";
import { Badge, Card, CardHeader } from "@/components/ui/primitives";
import { Alert } from "@/components/ui/feedback";

export const metadata: Metadata = { title: "Course" };

export default async function LearnerCoursePage({
  params,
}: {
  params: Promise<{ orgSlug: string; enrollmentId: string; courseId: string }>;
}) {
  const { orgSlug, enrollmentId, courseId } = await params;
  const ctx = await requireOrgContext(orgSlug);
  const user = await requireUser();
  const { term } = await getTerminology(ctx.organization.id);

  const view = await getEnrolledCourse(enrollmentId, courseId, user.id);
  if (view === null) notFound();
  if (view === "version_unavailable") {
    return (
      <Alert tone="warning" title="Temporarily unavailable">
        This {term("course").singular.toLowerCase()} has no published version
        available right now. Please check back, or contact your{" "}
        {term("instructor").singular.toLowerCase()}.
      </Alert>
    );
  }

  const accessByLesson = new Map(view.access.map((a) => [a.lessonId, a]));
  const stateBadge = {
    available: { tone: "positive" as const, label: "Available" },
    completed: { tone: "accent" as const, label: "Done" },
    locked_by_sequence: { tone: "neutral" as const, label: "Locked" },
    not_enrolled: { tone: "warning" as const, label: "Unavailable" },
    version_unavailable: { tone: "warning" as const, label: "Unavailable" },
  };

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <p
          className="text-caption uppercase text-text-muted"
          style={{ letterSpacing: "var(--tracking-caps)" }}
        >
          <Link href={`/${orgSlug}/learn`} className="hover:text-text-primary">
            My learning
          </Link>{" "}
          / {term("course").singular.toLowerCase()}
        </p>
        <h1 className="text-h1 text-text-primary">{view.courseTitle}</h1>
        <p className="text-body-sm text-text-secondary">
          Version {view.versionNumber}
          {view.courseCompleted ? " · completed — well done" : ""}
        </p>
      </header>

      {view.courseCompleted ? (
        <Alert tone="success" title="Completed">
          You finished this {term("course").singular.toLowerCase()} on version{" "}
          {view.versionNumber}. Your completion stays valid even when newer
          versions publish.
        </Alert>
      ) : null}

      {[...view.structure.modules]
        .sort((a, b) => (a.position < b.position ? -1 : 1))
        .map((module) => (
          <Card key={module.moduleId}>
            <CardHeader title={module.title} />
            <ol className="divide-y divide-border-subtle">
              {[...module.lessons]
                .sort((a, b) => (a.position < b.position ? -1 : 1))
                .map((lesson) => {
                  const access = accessByLesson.get(lesson.lessonId);
                  const badge =
                    stateBadge[access?.state ?? "version_unavailable"];
                  const openable =
                    access?.state === "available" ||
                    access?.state === "completed";
                  const inner = (
                    <>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-body text-text-primary">
                          {lesson.title}
                        </span>
                        {access?.reason ? (
                          <span className="text-caption text-text-muted">
                            {access.reason}
                          </span>
                        ) : null}
                      </span>
                      {!lesson.required ? (
                        <Badge tone="neutral">optional</Badge>
                      ) : null}
                      <Badge tone={badge.tone}>{badge.label}</Badge>
                    </>
                  );
                  return (
                    <li key={lesson.lessonId}>
                      {openable ? (
                        <Link
                          href={`/${orgSlug}/learn/${enrollmentId}/courses/${courseId}/lessons/${lesson.lessonId}`}
                          className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-surface-interactive"
                        >
                          {inner}
                        </Link>
                      ) : (
                        <div
                          aria-disabled
                          className="flex items-center gap-3 px-5 py-3.5 opacity-80"
                        >
                          {inner}
                        </div>
                      )}
                    </li>
                  );
                })}
            </ol>
          </Card>
        ))}
    </div>
  );
}
