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
  practicalGated = false,
  backHref,
}: {
  orgSlug: string;
  enrollmentId: string;
  courseId: string;
  lessonId: string;
  completed: boolean;
  /** A required assessment owns completion — hide self-complete. */
  assessmentGated?: boolean;
  /** An observed practical evaluation owns completion — hide self-complete. */
  practicalGated?: boolean;
  backHref: string;
}) {
  const [state, setState] = useState<ActionState>(idle);
  const [justCompleted, setJustCompleted] = useState(false);
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

  const isDone = completed || justCompleted;

  if (isDone) {
    return (
      <CompletionMoment
        backHref={backHref}
        // Only animate the fresh completion, not a revisit of a done lesson.
        celebrate={justCompleted}
      />
    );
  }

  return (
    <footer className="flex flex-wrap items-center gap-3 border-t border-border-default pt-5">
      <Link
        href={backHref}
        className="rounded-md px-1 text-body-sm text-text-secondary transition-colors hover:text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        ← Back
      </Link>
      <div className="ml-auto">
        {practicalGated ? (
          <p className="text-body-sm text-text-muted">
            Your evaluator records this step once it is observed at standard.
          </p>
        ) : assessmentGated ? (
          <p className="text-body-sm text-text-muted">
            Pass the check above to complete this lesson.
          </p>
        ) : (
          <Button
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await recordProgressAction(
                  orgSlug,
                  enrollmentId,
                  courseId,
                  lessonId,
                  "complete",
                );
                setState(result);
                if (result.ok) setJustCompleted(true);
              })
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

/** Rewarding, restrained completion confirmation (reduced-motion aware). */
function CompletionMoment({
  backHref,
  celebrate,
}: {
  backHref: string;
  celebrate: boolean;
}) {
  const [shown, setShown] = useState(!celebrate);
  useEffect(() => {
    if (!celebrate) return;
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, [celebrate]);

  return (
    <footer
      className="flex flex-col items-center gap-3 border-t border-border-default pt-6 text-center"
      role="status"
    >
      <span
        aria-hidden
        className={[
          "flex size-11 items-center justify-center rounded-full bg-accent-soft text-lg text-accent",
          "transition-all duration-[var(--motion-slow,300ms)] ease-out motion-reduce:transition-none",
          shown ? "scale-100 opacity-100" : "scale-75 opacity-0",
        ].join(" ")}
      >
        ✓
      </span>
      <div className="space-y-0.5">
        <p className="text-body font-semibold text-text-primary">
          {celebrate ? "Nice work — lesson complete" : "Lesson complete"}
        </p>
        <p className="text-body-sm text-text-secondary">
          Your progress is saved. Keep the momentum going.
        </p>
      </div>
      <Link
        href={backHref}
        className="mt-1 inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-label font-medium text-accent-contrast transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        Back to overview
        <span aria-hidden>→</span>
      </Link>
    </footer>
  );
}
