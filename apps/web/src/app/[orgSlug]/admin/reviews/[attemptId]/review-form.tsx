"use client";

import { useState, useTransition } from "react";
import {
  claimReviewAction,
  completeReviewAction,
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

interface SubjectiveItem {
  id: string;
  prompt: string;
  points: number;
  required: boolean;
  rubric: string | null;
  responseText: string | null;
}

export function ReviewForm({
  orgSlug,
  detail,
}: {
  orgSlug: string;
  detail: {
    attemptId: string;
    reviewStatus: string;
    subjectiveItems: SubjectiveItem[];
  };
}) {
  const [scores, setScores] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<Record<string, string>>({});
  const [overall, setOverall] = useState("");
  const [state, setState] = useState<ActionState>(idle);
  const [pending, startTransition] = useTransition();

  const scoreProblems = detail.subjectiveItems.flatMap((item) => {
    const raw = scores[item.id];
    if (raw === undefined || raw === "") {
      return item.required || item.responseText !== null
        ? [`"${item.prompt.slice(0, 40)}…" needs a score`]
        : [];
    }
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0 || value > item.points) {
      return [
        `Score for "${item.prompt.slice(0, 40)}…" must be 0–${item.points}`,
      ];
    }
    return [];
  });

  return (
    <Card>
      <CardHeader
        title="Subjective responses"
        description="Score each response against its rubric. Completing the review finalizes the attempt."
      />
      <ul className="divide-y divide-border-subtle">
        {detail.subjectiveItems.map((item) => (
          <li key={item.id} className="space-y-2 px-5 py-4">
            <p className="text-body font-medium text-text-primary">
              {item.prompt}
            </p>
            {item.rubric ? (
              <p className="rounded-md bg-background-subtle px-3 py-2 text-caption text-text-secondary">
                Rubric: {item.rubric}
              </p>
            ) : null}
            {item.responseText !== null ? (
              <blockquote className="whitespace-pre-wrap rounded-md border border-border-default px-3 py-2 text-body-sm text-text-primary">
                {item.responseText}
              </blockquote>
            ) : (
              <Badge tone="warning">no response</Badge>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <label
                className="text-body-sm text-text-secondary"
                htmlFor={`score-${item.id}`}
              >
                Score (0–{item.points})
              </label>
              <Input
                id={`score-${item.id}`}
                type="number"
                min={0}
                max={item.points}
                className="w-24"
                value={scores[item.id] ?? ""}
                onChange={(e) =>
                  setScores((s) => ({ ...s, [item.id]: e.target.value }))
                }
              />
            </div>
            <Textarea
              aria-label="Feedback for the learner"
              placeholder="Feedback for the learner (optional)"
              rows={2}
              value={feedback[item.id] ?? ""}
              onChange={(e) =>
                setFeedback((f) => ({ ...f, [item.id]: e.target.value }))
              }
            />
          </li>
        ))}
      </ul>

      <div className="space-y-3 border-t border-border-subtle px-5 py-4">
        <Textarea
          aria-label="Overall feedback"
          placeholder="Overall feedback (optional)"
          rows={2}
          value={overall}
          onChange={(e) => setOverall(e.target.value)}
        />
        {scoreProblems.length > 0 ? (
          <p role="alert" className="text-caption text-danger">
            {scoreProblems[0]}
          </p>
        ) : null}
        <ActionBanner state={state} />
        <div className="flex flex-wrap gap-2">
          {detail.reviewStatus === "pending_review" ? (
            <Button
              variant="secondary"
              disabled={pending}
              onClick={() =>
                startTransition(async () =>
                  setState(await claimReviewAction(orgSlug, detail.attemptId)),
                )
              }
            >
              Claim review
            </Button>
          ) : null}
          <Button
            disabled={pending || scoreProblems.length > 0}
            onClick={() =>
              startTransition(async () =>
                setState(
                  await completeReviewAction(
                    orgSlug,
                    detail.attemptId,
                    Object.fromEntries(
                      Object.entries(scores)
                        .filter(([, v]) => v !== "")
                        .map(([k, v]) => [k, Number(v)]),
                    ),
                    feedback,
                    overall,
                  ),
                ),
              )
            }
          >
            {pending ? "Working…" : "Complete review"}
          </Button>
        </div>
      </div>
    </Card>
  );
}
