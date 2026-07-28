"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { AssessmentItemType } from "@novakore/domain";
import {
  saveResponseAction,
  startAttemptAction,
  submitAttemptAction,
} from "@/lib/actions/assessments";
import { idle, type ActionState } from "@/lib/actions/types";
import {
  ActionBanner,
  Badge,
  Button,
  Card,
  CardHeader,
  Input,
  Textarea,
} from "@/components/ui/primitives";
import { Alert } from "@/components/ui/feedback";

/**
 * Learner attempt flow. The payload arrives from the answer-stripped RPC —
 * correct answers never exist client-side; the countdown is display only
 * (the server clock is the authority on expiration).
 */

export interface AttemptPayload {
  attemptId: string;
  status: string;
  attemptNumber: number;
  expiresAt: string | null;
  timeLimitMinutes: number | null;
  passingPercent: number;
  title: string;
  versionNumber: number;
  items: {
    id: string;
    type: AssessmentItemType;
    position: string;
    required: boolean;
    prompt: string;
    instructions?: string;
    points: number;
    options?: { id: string; text: string }[];
    maxLength?: number;
    uploadDeferred?: boolean;
  }[];
  responses: Record<string, Record<string, unknown>>;
}

interface AttemptSummary {
  id: string;
  status: string;
  attemptNumber: number;
  scorePercent: number | null;
  passingPercent: number;
}

export function AttemptFlow({
  orgSlug,
  assignmentId,
  enrollmentId,
  attempts,
  openPayload,
  feedback,
  backHref,
}: {
  orgSlug: string;
  assignmentId: string;
  enrollmentId: string;
  attempts: AttemptSummary[];
  openPayload: AttemptPayload | null;
  feedback: {
    itemFeedback: { prompt: string; text: string }[];
    overall: string | null;
  } | null;
  backHref: string;
}) {
  const router = useRouter();
  const [state, setState] = useState<ActionState>(idle);
  const [pending, startTransition] = useTransition();

  const passed = attempts.some((a) => a.status === "passed");
  const pendingReview = attempts.find((a) => a.status === "pending_review");
  const latest = attempts.at(-1);

  const run = (fn: () => Promise<ActionState>, refresh = true) =>
    startTransition(async () => {
      const outcome = await fn();
      setState(outcome);
      if (outcome.ok && refresh) router.refresh();
    });

  if (openPayload) {
    return (
      <ActiveAttempt
        orgSlug={orgSlug}
        payload={openPayload}
        backHref={backHref}
        onSubmitted={() => router.refresh()}
      />
    );
  }

  return (
    <div className="space-y-6">
      {passed ? (
        <Alert tone="success" title="Passed">
          You passed this assessment
          {latest?.scorePercent !== null && latest?.scorePercent !== undefined
            ? ` with ${latest.scorePercent}%`
            : ""}
          . Your result stays valid even when newer versions publish.
        </Alert>
      ) : pendingReview ? (
        <Alert tone="info" title="Awaiting review">
          Attempt {pendingReview.attemptNumber} is with a reviewer. You will see
          your result and feedback here once the review completes.
        </Alert>
      ) : latest?.status === "failed" ? (
        <Alert tone="warning" title="Not passed yet">
          Attempt {latest.attemptNumber} scored {latest.scorePercent}% (passing
          is {latest.passingPercent}%). You can retake the assessment when you
          are ready.
        </Alert>
      ) : latest?.status === "expired" ? (
        <Alert tone="warning" title="Time expired">
          Attempt {latest.attemptNumber} ran out of time before submission.
          Start a new attempt when you are ready.
        </Alert>
      ) : null}

      {feedback && (feedback.overall || feedback.itemFeedback.length > 0) ? (
        <Card>
          <CardHeader title="Reviewer feedback" />
          <div className="space-y-3 px-5 py-4">
            {feedback.itemFeedback.map((f, i) => (
              <div key={i}>
                <p className="text-caption text-text-muted">{f.prompt}</p>
                <p className="text-body-sm text-text-primary">{f.text}</p>
              </div>
            ))}
            {feedback.overall ? (
              <p className="border-t border-border-subtle pt-3 text-body-sm text-text-primary">
                {feedback.overall}
              </p>
            ) : null}
          </div>
        </Card>
      ) : null}

      {attempts.length > 0 ? (
        <Card>
          <CardHeader title="Your attempts" />
          <ul className="divide-y divide-border-subtle">
            {attempts.map((a) => (
              <li
                key={a.id}
                className="flex items-center gap-3 px-5 py-2.5 text-body-sm"
              >
                <span className="flex-1 text-text-secondary">
                  Attempt {a.attemptNumber}
                </span>
                {a.scorePercent !== null ? (
                  <span className="font-mono text-caption text-text-muted">
                    {a.scorePercent}%
                  </span>
                ) : null}
                <Badge
                  tone={
                    a.status === "passed"
                      ? "positive"
                      : a.status === "failed"
                        ? "danger"
                        : a.status === "pending_review"
                          ? "warning"
                          : "neutral"
                  }
                >
                  {a.status.replace(/_/g, " ")}
                </Badge>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <ActionBanner state={state} />
      <footer className="flex flex-wrap items-center gap-3 border-t border-border-default pt-5">
        <Link
          href={backHref}
          className="text-body-sm text-text-secondary hover:text-text-primary"
        >
          ← Back to the lesson
        </Link>
        {!passed && !pendingReview ? (
          <div className="ml-auto">
            <Button
              disabled={pending}
              onClick={() =>
                run(() =>
                  startAttemptAction(orgSlug, assignmentId, enrollmentId),
                )
              }
            >
              {pending
                ? "Starting…"
                : attempts.length === 0
                  ? "Start attempt"
                  : "Start new attempt"}
            </Button>
          </div>
        ) : null}
      </footer>
    </div>
  );
}

function ActiveAttempt({
  orgSlug,
  payload,
  backHref,
  onSubmitted,
}: {
  orgSlug: string;
  payload: AttemptPayload;
  backHref: string;
  onSubmitted: () => void;
}) {
  const [responses, setResponses] = useState<
    Record<string, Record<string, unknown>>
  >(payload.responses);
  const [saveState, setSaveState] = useState<ActionState>(idle);
  const [pending, startTransition] = useTransition();
  const sorted = useMemo(
    () => [...payload.items].sort((a, b) => (a.position < b.position ? -1 : 1)),
    [payload.items],
  );
  const answered = sorted.filter((i) => responses[i.id] !== undefined).length;

  const save = (
    itemId: string,
    type: AssessmentItemType,
    response: Record<string, unknown>,
  ) => {
    setResponses((r) => ({ ...r, [itemId]: response }));
    startTransition(async () => {
      const outcome = await saveResponseAction(
        orgSlug,
        payload.attemptId,
        itemId,
        type,
        response,
      );
      if (!outcome.ok) setSaveState(outcome);
    });
  };

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-wrap items-center gap-3 px-5 py-3.5">
          <Badge tone="neutral">v{payload.versionNumber}</Badge>
          <Badge tone="neutral">Attempt {payload.attemptNumber}</Badge>
          <Badge tone="neutral">Pass at {payload.passingPercent}%</Badge>
          <span className="text-caption text-text-muted">
            {answered}/{sorted.length} answered
          </span>
          {payload.expiresAt ? (
            <Countdown expiresAt={payload.expiresAt} />
          ) : null}
        </div>
      </Card>

      <ol className="space-y-5">
        {sorted.map((item, index) => (
          <li key={item.id}>
            <Card>
              <div className="space-y-3 px-5 py-4">
                <div className="flex items-start gap-2">
                  <span className="text-caption tabular-nums text-text-muted">
                    {index + 1}.
                  </span>
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-body font-medium text-text-primary">
                      {item.prompt}
                    </p>
                    {item.instructions ? (
                      <p className="text-body-sm text-text-secondary">
                        {item.instructions}
                      </p>
                    ) : null}
                  </div>
                  <span className="text-caption text-text-muted">
                    {item.points} pts{item.required ? "" : " · optional"}
                  </span>
                </div>
                <ResponseField
                  item={item}
                  value={responses[item.id]}
                  onChange={(response) => save(item.id, item.type, response)}
                />
              </div>
            </Card>
          </li>
        ))}
      </ol>

      <ActionBanner state={saveState} />
      <footer className="flex flex-wrap items-center gap-3 border-t border-border-default pt-5">
        <Link
          href={backHref}
          className="text-body-sm text-text-secondary hover:text-text-primary"
        >
          ← Save and come back later
        </Link>
        <div className="ml-auto">
          <Button
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const outcome = await submitAttemptAction(
                  orgSlug,
                  payload.attemptId,
                );
                setSaveState(outcome);
                if (outcome.ok) onSubmitted();
              })
            }
          >
            {pending ? "Submitting…" : "Submit attempt"}
          </Button>
        </div>
      </footer>
    </div>
  );
}

/** Display-only countdown; the server clock decides expiration. */
function Countdown({ expiresAt }: { expiresAt: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const remaining = Math.max(
    0,
    Math.floor((Date.parse(expiresAt) - now) / 1000),
  );
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  return (
    <span
      className={`ml-auto font-mono text-body-sm ${remaining < 120 ? "text-danger" : "text-text-secondary"}`}
      role="timer"
      aria-label="Time remaining (display only)"
    >
      {minutes}:{String(seconds).padStart(2, "0")}
    </span>
  );
}

function ResponseField({
  item,
  value,
  onChange,
}: {
  item: AttemptPayload["items"][number];
  value: Record<string, unknown> | undefined;
  onChange: (response: Record<string, unknown>) => void;
}) {
  switch (item.type) {
    case "multiple_choice":
      return (
        <ul className="space-y-1.5">
          {(item.options ?? []).map((option) => (
            <li key={option.id}>
              <label className="flex items-center gap-2 text-body-sm text-text-primary">
                <input
                  type="radio"
                  name={`response-${item.id}`}
                  checked={value?.optionId === option.id}
                  onChange={() => onChange({ optionId: option.id })}
                />
                {option.text}
              </label>
            </li>
          ))}
        </ul>
      );
    case "multiple_select": {
      const chosen = (value?.optionIds ?? []) as string[];
      return (
        <ul className="space-y-1.5">
          {(item.options ?? []).map((option) => (
            <li key={option.id}>
              <label className="flex items-center gap-2 text-body-sm text-text-primary">
                <input
                  type="checkbox"
                  checked={chosen.includes(option.id)}
                  onChange={(e) => {
                    const next = e.target.checked
                      ? [...chosen, option.id]
                      : chosen.filter((id) => id !== option.id);
                    if (next.length > 0) onChange({ optionIds: next });
                  }}
                />
                {option.text}
              </label>
            </li>
          ))}
        </ul>
      );
    }
    case "true_false":
      return (
        <div className="flex gap-4">
          {[true, false].map((v) => (
            <label
              key={String(v)}
              className="flex items-center gap-2 text-body-sm text-text-primary"
            >
              <input
                type="radio"
                name={`response-${item.id}`}
                checked={value?.value === v}
                onChange={() => onChange({ value: v })}
              />
              {v ? "True" : "False"}
            </label>
          ))}
        </div>
      );
    case "short_answer":
      return (
        <Input
          aria-label="Your answer"
          maxLength={item.maxLength}
          defaultValue={String(value?.text ?? "")}
          onBlur={(e) => {
            if (e.target.value.trim() !== "")
              onChange({ text: e.target.value });
          }}
        />
      );
    case "long_answer":
      return (
        <Textarea
          aria-label="Your answer"
          rows={6}
          maxLength={item.maxLength}
          defaultValue={String(value?.text ?? "")}
          onBlur={(e) => {
            if (e.target.value.trim() !== "")
              onChange({ text: e.target.value });
          }}
        />
      );
    case "file_submission":
      return (
        <div className="space-y-2">
          <Alert tone="info" title="File uploads are not yet enabled">
            Describe your submission below; your reviewer will collect the file
            with you directly. Nothing is uploaded from this page.
          </Alert>
          <Textarea
            aria-label="Submission note"
            rows={3}
            placeholder="Describe the file you will provide (name, format, where you shared it)…"
            defaultValue={String(value?.note ?? "")}
            onBlur={(e) => {
              if (e.target.value.trim() !== "")
                onChange({ note: e.target.value });
            }}
          />
        </div>
      );
  }
}
