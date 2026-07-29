import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrgContext } from "@/lib/org-context";
import { requireUser } from "@/lib/auth";
import { getEnrolledCourse, parseFrozenBlocks } from "@/lib/data/learning";
import { getLessonAssessments } from "@/lib/data/assessments";
import { resolveMediaUrls } from "@/lib/data/media";
import { getTerminology } from "@/lib/terminology";
import { supabaseServer } from "@/lib/supabase/server";
import { Badge, Card, CardHeader } from "@/components/ui/primitives";
import { Alert } from "@/components/ui/feedback";
import { BlockList } from "@/components/learning/block-renderer";
import { LessonActions } from "./lesson-actions";

export const metadata: Metadata = { title: "Lesson" };

export default async function LessonViewerPage({
  params,
}: {
  params: Promise<{
    orgSlug: string;
    enrollmentId: string;
    courseId: string;
    lessonId: string;
  }>;
}) {
  const { orgSlug, enrollmentId, courseId, lessonId } = await params;
  const ctx = await requireOrgContext(orgSlug);
  const user = await requireUser();
  const { term } = await getTerminology(ctx.organization.id);

  const view = await getEnrolledCourse(enrollmentId, courseId, user.id);
  if (view === null || view === "version_unavailable") notFound();

  const access = view.access.find((a) => a.lessonId === lessonId);
  if (!access) notFound(); // not part of the assigned version → indistinguishable 404
  if (
    access.state === "locked_by_sequence" ||
    access.state === "not_enrolled"
  ) {
    return (
      <div className="space-y-4">
        <Alert tone="info" title="Locked">
          {access.reason ?? "This lesson is not available yet."}
        </Alert>
        <Link
          href={`/${orgSlug}/learn/${enrollmentId}/courses/${courseId}`}
          className="text-body-sm text-accent hover:text-accent-hover"
        >
          Back to the {term("course").singular.toLowerCase()}
        </Link>
      </div>
    );
  }

  // Load the EXACT pinned lesson version (never "latest").
  const supabase = await supabaseServer();
  const { data: lessonVersion } = await supabase
    .from("lesson_versions")
    .select("id, title, version_number, blocks, estimated_minutes")
    .eq("id", access.lessonVersionId)
    .maybeSingle();
  if (!lessonVersion) {
    return (
      <Alert tone="warning" title="Temporarily unavailable">
        Your assigned version of this {term("lesson").singular.toLowerCase()}{" "}
        could not be loaded. Contact your{" "}
        {term("instructor").singular.toLowerCase()}.
      </Alert>
    );
  }
  const blocks = parseFrozenBlocks(lessonVersion.blocks);
  const mediaUrls = await resolveMediaUrls(blocks);
  const completed = access.state === "completed";
  const assessments = await getLessonAssessments(
    ctx.organization.id,
    lessonId,
    enrollmentId,
  );
  const requiredAssessmentPending = assessments.some(
    (entry) =>
      entry.required && !entry.attempts.some((a) => a.status === "passed"),
  );

  return (
    <article className="space-y-6">
      <header className="space-y-1.5">
        <p
          className="text-caption uppercase text-text-muted"
          style={{ letterSpacing: "var(--tracking-caps)" }}
        >
          <Link
            href={`/${orgSlug}/learn/${enrollmentId}/courses/${courseId}`}
            className="hover:text-text-primary"
          >
            {view.courseTitle}
          </Link>
        </p>
        <h1 className="text-h1 text-text-primary">{lessonVersion.title}</h1>
        <div className="flex items-center gap-2">
          <Badge tone="neutral">v{lessonVersion.version_number}</Badge>
          {lessonVersion.estimated_minutes ? (
            <span className="text-caption text-text-muted">
              ~{lessonVersion.estimated_minutes} min
            </span>
          ) : null}
          {completed ? <Badge tone="accent">Completed</Badge> : null}
        </div>
      </header>

      {blocks.length > 0 ? (
        <BlockList blocks={blocks} mediaUrls={mediaUrls} />
      ) : (
        <Alert tone="info" title="Empty lesson">
          This {term("lesson").singular.toLowerCase()} has no content yet.
        </Alert>
      )}

      {assessments.length > 0 ? (
        <Card>
          <CardHeader
            title={term("assessment").plural}
            description={
              requiredAssessmentPending
                ? `Passing is required to complete this ${term("lesson").singular.toLowerCase()}.`
                : undefined
            }
          />
          <ul className="divide-y divide-border-subtle">
            {assessments.map((entry) => {
              const latest = entry.attempts.at(-1);
              const passed = entry.attempts.some((a) => a.status === "passed");
              const open = entry.attempts.find(
                (a) => a.status === "started" || a.status === "pending_review",
              );
              return (
                <li key={entry.assignmentId}>
                  <Link
                    href={`/${orgSlug}/learn/${enrollmentId}/assessments/${entry.assignmentId}`}
                    className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-surface-interactive"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-body font-medium text-text-primary">
                        {entry.assessmentTitle}
                      </span>
                      <span className="text-caption text-text-muted">
                        {entry.attempts.length === 0
                          ? "Not attempted yet"
                          : `Attempt ${latest!.attemptNumber}${
                              latest!.scorePercent !== null
                                ? ` · ${latest!.scorePercent}%`
                                : ""
                            }`}
                      </span>
                    </span>
                    {entry.required ? (
                      <Badge tone="accent">required</Badge>
                    ) : null}
                    <Badge
                      tone={
                        passed
                          ? "positive"
                          : open?.status === "pending_review"
                            ? "warning"
                            : latest?.status === "failed"
                              ? "danger"
                              : "neutral"
                      }
                    >
                      {passed
                        ? "Passed"
                        : open
                          ? open.status.replace(/_/g, " ")
                          : latest
                            ? latest.status.replace(/_/g, " ")
                            : "Available"}
                    </Badge>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      ) : null}

      <LessonActions
        orgSlug={orgSlug}
        enrollmentId={enrollmentId}
        courseId={courseId}
        lessonId={lessonId}
        completed={completed}
        assessmentGated={requiredAssessmentPending}
        backHref={`/${orgSlug}/learn/${enrollmentId}/courses/${courseId}`}
      />
    </article>
  );
}
