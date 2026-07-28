"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { recordProgressAction } from "@/lib/actions/learning";
import { idle, type ActionState } from "@/lib/actions/types";
import { ActionBanner, Button } from "@/components/ui/primitives";

export function LessonActions({
  orgSlug,
  enrollmentId,
  courseId,
  lessonId,
  completed,
  assessmentGated = false,
  backHref,
}: {
  orgSlug: string;
  enrollmentId: string;
  courseId: string;
  lessonId: string;
  completed: boolean;
  /** A required assessment owns completion — hide self-complete. */
  assessmentGated?: boolean;
  backHref: string;
}) {
  const [state, setState] = useState<ActionState>(idle);
  const [pending, startTransition] = useTransition();
  const startedRef = useRef(false);

  // Server-recorded "started" signal on first open (idempotent server-side).
  useEffect(() => {
    if (completed || startedRef.current) return;
    startedRef.current = true;
    startTransition(async () => {
      await recordProgressAction(
        orgSlug,
        enrollmentId,
        courseId,
        lessonId,
        "start",
      );
    });
  }, [completed, orgSlug, enrollmentId, courseId, lessonId]);

  return (
    <footer className="flex flex-wrap items-center gap-3 border-t border-border-default pt-5">
      <Link
        href={backHref}
        className="text-body-sm text-text-secondary hover:text-text-primary"
      >
        ← Back
      </Link>
      <div className="ml-auto">
        {completed ? (
          <p className="text-body-sm font-medium text-success">Completed ✓</p>
        ) : assessmentGated ? (
          <p className="text-body-sm text-text-muted">
            Pass the assessment above to complete this lesson.
          </p>
        ) : (
          <Button
            disabled={pending}
            onClick={() =>
              startTransition(async () =>
                setState(
                  await recordProgressAction(
                    orgSlug,
                    enrollmentId,
                    courseId,
                    lessonId,
                    "complete",
                  ),
                ),
              )
            }
          >
            {pending ? "Saving…" : "Mark complete"}
          </Button>
        )}
      </div>
      <div className="w-full empty:hidden">
        <ActionBanner state={state} />
      </div>
    </footer>
  );
}
