"use client";

import { useState, useTransition } from "react";
import type { PracticalResult } from "@novakore/domain";
import type { PracticalWorkbenchRow } from "@/lib/data/practicals";
import { recordPracticalEvaluationAction } from "@/lib/actions/practicals";
import { idle, type ActionState } from "@/lib/actions/types";
import {
  ActionBanner,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Input,
  Select,
  Textarea,
} from "@/components/ui/primitives";

const STATUS_LABEL: Record<
  string,
  { label: string; tone: "positive" | "warning" | "danger" | "neutral" }
> = {
  passed: { label: "Passed", tone: "positive" },
  remediation_open: { label: "Remediation open", tone: "warning" },
  failed: { label: "Not yet at standard", tone: "danger" },
  not_evaluated: { label: "Awaiting evaluation", tone: "neutral" },
};

export function PracticalsWorkbench({
  orgSlug,
  rows,
}: {
  orgSlug: string;
  rows: PracticalWorkbenchRow[];
}) {
  if (rows.length === 0) {
    return (
      <EmptyState
        title="No practical requirements"
        description="Courses with observed sign-offs or terminal defenses will appear here."
      />
    );
  }
  return (
    <div className="space-y-6">
      {rows.map((row) => (
        <Card key={row.requirement.id}>
          <CardHeader
            title={`${row.requirement.code} · ${row.requirement.title}`}
            description={`${row.courseTitle} — ${row.lessonTitle}${
              row.requirement.kind === "terminal_defense"
                ? " · terminal defense"
                : " · practical sign-off"
            }`}
          />
          <div className="space-y-3 px-5 pb-5">
            {row.requirement.rubric ? (
              <p className="text-caption text-text-muted">
                Rubric: {row.requirement.rubric.dimensions.join(" · ")}
                {row.requirement.rubric.scale
                  ? ` (scale ${row.requirement.rubric.scale})`
                  : ""}
                {row.requirement.rubric.pass
                  ? ` — pass: ${row.requirement.rubric.pass}`
                  : ""}
              </p>
            ) : null}
            {row.learners.length === 0 ? (
              <p className="text-body-sm text-text-muted">
                No covered enrollments yet.
              </p>
            ) : (
              <ul className="divide-y divide-border-subtle">
                {row.learners.map((learner) => (
                  <LearnerRow
                    key={learner.enrollmentId}
                    orgSlug={orgSlug}
                    row={row}
                    learner={learner}
                  />
                ))}
              </ul>
            )}
          </div>
        </Card>
      ))}
    </div>
  );
}

function LearnerRow({
  orgSlug,
  row,
  learner,
}: {
  orgSlug: string;
  row: PracticalWorkbenchRow;
  learner: PracticalWorkbenchRow["learners"][number];
}) {
  const [open, setOpen] = useState(false);
  const status = STATUS_LABEL[learner.status] ?? STATUS_LABEL.not_evaluated;
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="min-w-0 flex-1 text-body font-medium text-text-primary">
          {learner.learnerName}
        </span>
        <Badge tone={status.tone}>{status.label}</Badge>
        {learner.status !== "passed" ? (
          <Button variant="secondary" onClick={() => setOpen((v) => !v)}>
            {open ? "Close" : "Record evaluation"}
          </Button>
        ) : null}
      </div>
      {learner.lastComments ? (
        <p className="mt-1 text-caption text-text-muted">
          Last note: {learner.lastComments}
        </p>
      ) : null}
      {open ? (
        <EvaluationForm
          orgSlug={orgSlug}
          requirementId={row.requirement.id}
          enrollmentId={learner.enrollmentId}
          dimensions={row.requirement.rubric?.dimensions ?? []}
          onDone={() => setOpen(false)}
        />
      ) : null}
    </li>
  );
}

function EvaluationForm({
  orgSlug,
  requirementId,
  enrollmentId,
  dimensions,
  onDone,
}: {
  orgSlug: string;
  requirementId: string;
  enrollmentId: string;
  dimensions: string[];
  onDone: () => void;
}) {
  const [state, setState] = useState<ActionState>(idle);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<PracticalResult>("passed");
  const [scores, setScores] = useState<Record<string, string>>({});
  const [evidence, setEvidence] = useState("");
  const [comments, setComments] = useState("");

  return (
    <form
      className="mt-3 space-y-3 rounded-md border border-border-subtle bg-background-subtle p-4"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const recorded = dimensions
            .map((dimension) => ({
              dimension,
              score: Number.parseFloat(scores[dimension] ?? ""),
            }))
            .filter((entry) => Number.isFinite(entry.score));
          const outcome = await recordPracticalEvaluationAction(orgSlug, {
            enrollmentId,
            requirementId,
            result,
            rubric: recorded.length > 0 ? { scores: recorded } : {},
            evidence: evidence.trim() === "" ? undefined : evidence.trim(),
            comments: comments.trim() === "" ? undefined : comments.trim(),
          });
          setState(outcome);
          if (outcome.ok) onDone();
        });
      }}
    >
      <Field label="Result" htmlFor={`${requirementId}-${enrollmentId}-result`}>
        <Select
          id={`${requirementId}-${enrollmentId}-result`}
          value={result}
          onChange={(event) => setResult(event.target.value as PracticalResult)}
        >
          <option value="passed">Passed</option>
          <option value="remediation_required">Remediation required</option>
          <option value="failed">Failed</option>
        </Select>
      </Field>
      {dimensions.length > 0 ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {dimensions.map((dimension) => (
            <Field
              key={dimension}
              label={dimension}
              htmlFor={`${enrollmentId}-${dimension}`}
            >
              <Input
                id={`${enrollmentId}-${dimension}`}
                inputMode="decimal"
                placeholder="score"
                value={scores[dimension] ?? ""}
                onChange={(event) =>
                  setScores((prev) => ({
                    ...prev,
                    [dimension]: event.target.value,
                  }))
                }
              />
            </Field>
          ))}
        </div>
      ) : null}
      <Field
        label="Observed evidence / artifacts"
        htmlFor={`${enrollmentId}-evidence`}
      >
        <Textarea
          id={`${enrollmentId}-evidence`}
          rows={2}
          value={evidence}
          onChange={(event) => setEvidence(event.target.value)}
        />
      </Field>
      <Field label="Comments" htmlFor={`${enrollmentId}-comments`}>
        <Textarea
          id={`${enrollmentId}-comments`}
          rows={2}
          value={comments}
          onChange={(event) => setComments(event.target.value)}
        />
      </Field>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Recording…" : "Record"}
        </Button>
      </div>
      <div className="empty:hidden">
        <ActionBanner state={state} />
      </div>
    </form>
  );
}
