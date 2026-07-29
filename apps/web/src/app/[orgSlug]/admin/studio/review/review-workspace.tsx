"use client";

import { useState, useTransition } from "react";
import {
  addReviewCommentAction,
  decideReviewAction,
  setCommentStatusAction,
} from "@/lib/actions/studio";
import { idle, type ActionState } from "@/lib/actions/types";
import type { StudioReviewData } from "@/lib/data/studio";
import {
  ActionBanner,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Input,
} from "@/components/ui/primitives";

export function ReviewWorkspace({
  orgSlug,
  data,
  currentUserId,
  canDecide,
}: {
  orgSlug: string;
  data: StudioReviewData;
  currentUserId: string;
  canDecide: boolean;
}) {
  const [feedback, setFeedback] = useState<ActionState>(idle);
  const [pending, startTransition] = useTransition();
  const [comment, setComment] = useState<Record<string, string>>({});

  const run = (fn: () => Promise<ActionState>) =>
    startTransition(async () => setFeedback(await fn()));

  if (data.requests.length === 0) {
    return (
      <Card>
        <EmptyState
          title="No review requests"
          description="Authors can request review from the lesson, course, or assessment editor."
        />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <ActionBanner state={feedback} />
      {data.requests.map((request) => {
        const isOwnRequest = request.requestedBy === currentUserId;
        const decidable =
          canDecide &&
          !isOwnRequest &&
          (request.status === "open" || request.status === "changes_requested");
        return (
          <Card key={request.id}>
            <CardHeader
              title={request.subjectTitle}
              description={`${request.subjectType} · ${request.note ?? "review requested"}`}
            />
            <div className="flex flex-wrap items-center gap-2 px-5 pb-2">
              <Badge
                tone={
                  request.status === "approved"
                    ? "positive"
                    : request.status === "changes_requested"
                      ? "warning"
                      : request.status === "closed"
                        ? "neutral"
                        : "accent"
                }
              >
                {request.status.replace(/_/g, " ")}
              </Badge>
              {isOwnRequest ? (
                <span className="text-caption text-text-muted">
                  You requested this — you can’t decide your own review.
                </span>
              ) : null}
            </div>

            <ul className="space-y-1.5 px-5 py-2">
              {request.comments.map((c) => (
                <li key={c.id} className="flex items-start gap-2 text-body-sm">
                  <span
                    className={`min-w-0 flex-1 ${c.status === "resolved" ? "text-text-muted line-through" : "text-text-primary"}`}
                  >
                    {c.body}
                  </span>
                  <Button
                    variant="ghost"
                    className="text-xs"
                    disabled={pending}
                    onClick={() =>
                      run(() =>
                        setCommentStatusAction(
                          orgSlug,
                          c.id,
                          c.status === "resolved" ? "open" : "resolved",
                        ),
                      )
                    }
                  >
                    {c.status === "resolved" ? "reopen" : "resolve"}
                  </Button>
                </li>
              ))}
            </ul>

            <div className="flex flex-wrap items-end gap-2 border-t border-border-subtle px-5 py-3">
              <div className="min-w-56 flex-1">
                <label htmlFor={`comment-${request.id}`} className="sr-only">
                  Add a comment
                </label>
                <Input
                  id={`comment-${request.id}`}
                  value={comment[request.id] ?? ""}
                  onChange={(e) =>
                    setComment((s) => ({ ...s, [request.id]: e.target.value }))
                  }
                  placeholder="Add a comment…"
                />
              </div>
              <Button
                variant="ghost"
                disabled={pending || !comment[request.id]?.trim()}
                onClick={() =>
                  run(async () => {
                    const result = await addReviewCommentAction(
                      orgSlug,
                      request.id,
                      comment[request.id] ?? "",
                    );
                    if (result.ok)
                      setComment((s) => ({ ...s, [request.id]: "" }));
                    return result;
                  })
                }
              >
                Comment
              </Button>
              {decidable ? (
                <>
                  <Button
                    variant="secondary"
                    disabled={pending}
                    onClick={() =>
                      run(() =>
                        decideReviewAction(orgSlug, request.id, "approved", ""),
                      )
                    }
                  >
                    Approve
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={pending}
                    onClick={() =>
                      run(() =>
                        decideReviewAction(
                          orgSlug,
                          request.id,
                          "changes_requested",
                          "",
                        ),
                      )
                    }
                  >
                    Request changes
                  </Button>
                </>
              ) : null}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
