"use client";

import { useState, useTransition } from "react";
import { usePathname } from "next/navigation";
import { submitFeedbackAction } from "@/lib/actions/feedback";
import { FEEDBACK_CATEGORIES, FEEDBACK_SEVERITIES } from "@/lib/feedback";
import { Button, Select, Textarea } from "@/components/ui/primitives";

/**
 * Floating internal-alpha feedback widget. Auto-captures the current route,
 * browser/device, a role hint, and any lesson/course/assignment in the URL —
 * the tester only picks a category and types. Rendered on member + admin
 * shells; harmless for anyone (RLS scopes the insert to their own membership).
 */
export function FeedbackWidget({
  orgSlug,
  roleHint,
}: {
  orgSlug: string;
  roleHint: string;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<string>(
    FEEDBACK_CATEGORIES[0].value,
  );
  const [severity, setSeverity] = useState<string>("");
  const [message, setMessage] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function captureContext(): Record<string, unknown> {
    const lesson = /\/lessons\/([0-9a-f-]{36})/i.exec(pathname)?.[1];
    const course = /\/courses\/([0-9a-f-]{36})/i.exec(pathname)?.[1];
    const assignment = /\/assessments\/([0-9a-f-]{36})/i.exec(pathname)?.[1];
    return {
      route: pathname,
      roleHint,
      userAgent:
        typeof navigator !== "undefined" ? navigator.userAgent : "unknown",
      viewport:
        typeof window !== "undefined"
          ? `${window.innerWidth}x${window.innerHeight}`
          : undefined,
      ...(lesson ? { lessonId: lesson } : {}),
      ...(course ? { courseId: course } : {}),
      ...(assignment ? { assignmentId: assignment } : {}),
      submittedAt: new Date().toISOString(),
    };
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await submitFeedbackAction(orgSlug, {
        category,
        severity: severity || null,
        message,
        context: captureContext(),
      });
      if (result.ok) {
        setDone(result.message ?? "Thanks — your feedback was sent.");
        setMessage("");
        setSeverity("");
      } else {
        setError(result.message ?? "Could not send feedback. Try again.");
      }
    });
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 print:hidden">
      {open ? (
        <div
          role="dialog"
          aria-label="Send feedback"
          className="w-[min(22rem,calc(100vw-2rem))] space-y-3 rounded-lg border border-border bg-surface p-4 shadow-overlay"
        >
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-text">Send feedback</p>
            <button
              onClick={() => {
                setOpen(false);
                setDone(null);
              }}
              aria-label="Close feedback"
              className="rounded px-1 text-text-muted hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              ✕
            </button>
          </div>

          {done ? (
            <div className="space-y-3">
              <p className="rounded-md bg-positive/10 px-3 py-2 text-sm text-positive">
                {done}
              </p>
              <Button
                variant="secondary"
                className="w-full justify-center"
                onClick={() => setDone(null)}
              >
                Send another
              </Button>
            </div>
          ) : (
            <>
              <label className="block space-y-1 text-sm">
                <span className="font-medium text-text">Type</span>
                <Select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  {FEEDBACK_CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="block space-y-1 text-sm">
                <span className="font-medium text-text">
                  Severity <span className="text-text-faint">(optional)</span>
                </span>
                <Select
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value)}
                >
                  <option value="">Not sure</option>
                  {FEEDBACK_SEVERITIES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="block space-y-1 text-sm">
                <span className="font-medium text-text">What happened?</span>
                <Textarea
                  rows={4}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Describe the bug, confusion, or idea. The page and your device are captured automatically."
                />
              </label>
              {error ? (
                <p role="alert" className="text-xs text-danger">
                  {error}
                </p>
              ) : null}
              <Button
                className="w-full justify-center"
                disabled={pending || message.trim().length < 3}
                onClick={submit}
              >
                {pending ? "Sending…" : "Send feedback"}
              </Button>
            </>
          )}
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="rounded-full bg-accent px-4 py-2.5 text-sm font-medium text-accent-contrast shadow-overlay transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Feedback
        </button>
      )}
    </div>
  );
}
