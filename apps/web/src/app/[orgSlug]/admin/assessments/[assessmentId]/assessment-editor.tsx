"use client";

import { useMemo, useState, useTransition } from "react";
import {
  assessmentItemSchema,
  assessmentSettingsSchema,
  type AssessmentItemType,
} from "@novakore/domain";
import {
  archiveAssignmentAction,
  assignAssessmentAction,
  publishAssessmentAction,
  saveAssessmentAction,
} from "@/lib/actions/assessments";
import { idle, type ActionState } from "@/lib/actions/types";
import type { AssessmentDetail } from "@/lib/data/assessments";
import {
  ActionBanner,
  Badge,
  Button,
  Card,
  CardHeader,
  Field,
  Input,
  Select,
  Textarea,
} from "@/components/ui/primitives";
import { Alert } from "@/components/ui/feedback";

/**
 * Structured assessment editor: finite item types with typed fields, live
 * domain validation, distinct publish permission, and version-pinned
 * assignment management. Correct-answer configuration is staff-side by
 * definition here — this surface never renders for learners.
 */

type DraftItem = {
  id: string;
  type: AssessmentItemType;
  schemaVersion: number;
  data: Record<string, unknown>;
  position: string;
  required: boolean;
};

const ADDABLE: { type: AssessmentItemType; label: string }[] = [
  { type: "multiple_choice", label: "Multiple choice" },
  { type: "multiple_select", label: "Multiple select" },
  { type: "true_false", label: "True / false" },
  { type: "short_answer", label: "Short answer" },
  { type: "long_answer", label: "Long answer" },
  { type: "file_submission", label: "File submission" },
];

function defaultData(type: AssessmentItemType): Record<string, unknown> {
  switch (type) {
    case "multiple_choice": {
      const a = crypto.randomUUID();
      return {
        prompt: "Write the question here.",
        options: [
          { id: a, text: "First option" },
          { id: crypto.randomUUID(), text: "Second option" },
        ],
        correctOptionId: a,
        points: 10,
      };
    }
    case "multiple_select": {
      const a = crypto.randomUUID();
      return {
        prompt: "Select all that apply.",
        options: [
          { id: a, text: "First option" },
          { id: crypto.randomUUID(), text: "Second option" },
        ],
        correctOptionIds: [a],
        partialCredit: false,
        points: 10,
      };
    }
    case "true_false":
      return {
        prompt: "State a claim to evaluate.",
        correctValue: true,
        points: 5,
      };
    case "short_answer":
      return {
        prompt: "Ask for a short response.",
        maxLength: 500,
        points: 10,
      };
    case "long_answer":
      return {
        prompt: "Ask for a longer response.",
        maxLength: 5000,
        points: 10,
      };
    case "file_submission":
      return { prompt: "Describe the file to submit.", points: 10 };
  }
}

function nextPosition(items: DraftItem[]): string {
  const last = [...items]
    .sort((a, b) => (a.position < b.position ? -1 : 1))
    .at(-1);
  return last ? `${last.position}n` : "a0";
}

export function AssessmentEditor({
  orgSlug,
  detail,
  canPublish,
  canAssign,
  lessons,
  lessonTerm,
}: {
  orgSlug: string;
  detail: AssessmentDetail;
  canPublish: boolean;
  canAssign: boolean;
  lessons: { id: string; title: string; courseTitle: string }[];
  lessonTerm: string;
}) {
  const [title, setTitle] = useState(detail.title);
  const [settings, setSettings] = useState<Record<string, unknown>>({
    schemaVersion: 1,
    passingPercent: 70,
    cooldownMinutes: 0,
    scorePolicy: "highest",
    ...detail.settings,
  });
  const [items, setItems] = useState<DraftItem[]>(detail.items);
  const [dirty, setDirty] = useState(false);
  const [result, setResult] = useState<ActionState>(idle);
  const [pending, startTransition] = useTransition();
  const [assignLesson, setAssignLesson] = useState("");

  const sorted = useMemo(
    () => [...items].sort((a, b) => (a.position < b.position ? -1 : 1)),
    [items],
  );
  const validation = useMemo(
    () =>
      sorted.map((item) => {
        const parsed = assessmentItemSchema.safeParse(item);
        return parsed.success
          ? { id: item.id, ok: true as const }
          : {
              id: item.id,
              ok: false as const,
              error: parsed.error.issues[0]?.message ?? "invalid",
            };
      }),
    [sorted],
  );
  const settingsValid = useMemo(
    () => assessmentSettingsSchema.safeParse(settings).success,
    [settings],
  );
  const allValid = validation.every((v) => v.ok) && settingsValid;

  const mutate = (updater: (draft: DraftItem[]) => DraftItem[]) => {
    setItems((current) => updater([...current]));
    setDirty(true);
  };
  const updateData = (id: string, patch: Record<string, unknown>) =>
    mutate((draft) =>
      draft.map((i) =>
        i.id === id ? { ...i, data: { ...i.data, ...patch } } : i,
      ),
    );
  const run = (fn: () => Promise<ActionState>) =>
    startTransition(async () => {
      const outcome = await fn();
      setResult(outcome);
      if (outcome.ok) setDirty(false);
    });
  const save = () =>
    run(() =>
      saveAssessmentAction(orgSlug, detail.id, {
        title,
        settings,
        items: sorted,
      }),
    );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Status"
          description="Drafts are yours to shape; published versions are immutable and what learners attempt."
        />
        <div className="flex flex-wrap items-center gap-3 px-5 py-4">
          <Badge tone={detail.publishedVersionNumber ? "positive" : "neutral"}>
            {detail.publishedVersionNumber
              ? `Published v${detail.publishedVersionNumber} · ${new Date(detail.publishedAt!).toLocaleString()}`
              : "Never published"}
          </Badge>
          <Badge tone={dirty ? "warning" : "neutral"}>
            {dirty ? "Unsaved edits" : "Saved"}
          </Badge>
          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="secondary"
              disabled={pending || !allValid}
              onClick={save}
            >
              {pending ? "Working…" : "Save draft"}
            </Button>
            {canPublish ? (
              <Button
                disabled={pending || !allValid || items.length === 0}
                onClick={() =>
                  run(async () => {
                    const saved = await saveAssessmentAction(
                      orgSlug,
                      detail.id,
                      {
                        title,
                        settings,
                        items: sorted,
                      },
                    );
                    if (!saved.ok) return saved;
                    return publishAssessmentAction(orgSlug, detail.id);
                  })
                }
              >
                Publish version {(detail.publishedVersionNumber ?? 0) + 1}
              </Button>
            ) : (
              <span className="text-caption text-text-muted">
                Publishing requires publish access
              </span>
            )}
          </div>
        </div>
        <div className="px-5 pb-4 empty:hidden">
          <ActionBanner state={result} />
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Details & rules"
          description="Passing threshold, retakes, and time limits freeze into each published version."
        />
        <div className="grid gap-3 px-5 py-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Title" htmlFor="edit-title">
            <Input
              id="edit-title"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setDirty(true);
              }}
            />
          </Field>
          <Field label="Passing percent" htmlFor="edit-passing">
            <Input
              id="edit-passing"
              type="number"
              min={1}
              max={100}
              value={String(settings.passingPercent ?? 70)}
              onChange={(e) => {
                setSettings((s) => ({
                  ...s,
                  passingPercent: Number(e.target.value),
                }));
                setDirty(true);
              }}
            />
          </Field>
          <Field label="Time limit (min, blank = none)" htmlFor="edit-time">
            <Input
              id="edit-time"
              type="number"
              min={1}
              max={600}
              value={
                settings.timeLimitMinutes === undefined
                  ? ""
                  : String(settings.timeLimitMinutes)
              }
              onChange={(e) => {
                setSettings((s) => {
                  const next = { ...s };
                  if (e.target.value === "") delete next.timeLimitMinutes;
                  else next.timeLimitMinutes = Number(e.target.value);
                  return next;
                });
                setDirty(true);
              }}
            />
          </Field>
          <Field label="Max attempts (blank = unlimited)" htmlFor="edit-max">
            <Input
              id="edit-max"
              type="number"
              min={1}
              max={100}
              value={
                settings.maxAttempts === undefined
                  ? ""
                  : String(settings.maxAttempts)
              }
              onChange={(e) => {
                setSettings((s) => {
                  const next = { ...s };
                  if (e.target.value === "") delete next.maxAttempts;
                  else next.maxAttempts = Number(e.target.value);
                  return next;
                });
                setDirty(true);
              }}
            />
          </Field>
        </div>
        {!settingsValid ? (
          <p role="alert" className="px-5 pb-3 text-caption text-danger">
            Settings are out of bounds (passing 1–100, time 1–600, attempts
            1–100).
          </p>
        ) : null}
      </Card>

      <Card>
        <CardHeader
          title="Items"
          description="Finite, validated item types. Objective items grade on the server; subjective items route to review."
        />
        <ul className="divide-y divide-border-subtle">
          {sorted.map((item, index) => {
            const check = validation[index]!;
            return (
              <li key={item.id} className="space-y-2 px-5 py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="neutral">{item.type.replace(/_/g, " ")}</Badge>
                  <Badge tone="neutral">
                    {String((item.data.points as number) ?? 0)} pts
                  </Badge>
                  {!item.required ? (
                    <Badge tone="neutral">optional</Badge>
                  ) : null}
                  {!check.ok ? <Badge tone="danger">invalid</Badge> : null}
                  <span className="ml-auto flex gap-1">
                    <Button
                      variant="ghost"
                      className="px-2 text-xs"
                      aria-label="Move item up"
                      disabled={index === 0}
                      onClick={() =>
                        mutate((draft) => {
                          const a = sorted[index]!;
                          const b = sorted[index - 1]!;
                          return draft.map((i) =>
                            i.id === a.id
                              ? { ...i, position: b.position }
                              : i.id === b.id
                                ? { ...i, position: a.position }
                                : i,
                          );
                        })
                      }
                    >
                      ↑
                    </Button>
                    <Button
                      variant="ghost"
                      className="px-2 text-xs"
                      aria-label="Move item down"
                      disabled={index === sorted.length - 1}
                      onClick={() =>
                        mutate((draft) => {
                          const a = sorted[index]!;
                          const b = sorted[index + 1]!;
                          return draft.map((i) =>
                            i.id === a.id
                              ? { ...i, position: b.position }
                              : i.id === b.id
                                ? { ...i, position: a.position }
                                : i,
                          );
                        })
                      }
                    >
                      ↓
                    </Button>
                    <Button
                      variant="danger"
                      className="px-2 text-xs"
                      aria-label="Delete item"
                      onClick={() =>
                        mutate((draft) => draft.filter((i) => i.id !== item.id))
                      }
                    >
                      ✕
                    </Button>
                  </span>
                </div>

                <ItemFields
                  item={item}
                  onChange={(patch) => updateData(item.id, patch)}
                  onRequiredChange={(required) =>
                    mutate((draft) =>
                      draft.map((i) =>
                        i.id === item.id ? { ...i, required } : i,
                      ),
                    )
                  }
                />
                {!check.ok ? (
                  <p role="alert" className="text-caption text-danger">
                    {check.error}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
        <div className="flex flex-wrap gap-2 border-t border-border-subtle px-5 py-3.5">
          {ADDABLE.map(({ type, label }) => (
            <Button
              key={type}
              variant="secondary"
              className="text-xs"
              onClick={() =>
                mutate((draft) => [
                  ...draft,
                  {
                    id: crypto.randomUUID(),
                    type,
                    schemaVersion: 1,
                    data: defaultData(type),
                    position: nextPosition(draft),
                    required: true,
                  },
                ])
              }
            >
              + {label}
            </Button>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Attached to"
          description={`Assignments pin the exact published version. Re-pinning to a newer version = archive + attach again.`}
        />
        <ul className="divide-y divide-border-subtle">
          {detail.assignments.map((a) => (
            <li
              key={a.id}
              className="flex flex-wrap items-center gap-2 px-5 py-3"
            >
              <span className="min-w-0 flex-1 text-body-sm text-text-primary">
                {a.courseTitle} · {a.lessonTitle}
              </span>
              <Badge tone="neutral">pins v{a.versionNumber}</Badge>
              {a.required ? <Badge tone="accent">required</Badge> : null}
              <Badge tone={a.status === "active" ? "positive" : "neutral"}>
                {a.status}
              </Badge>
              {canAssign && a.status === "active" ? (
                <Button
                  variant="ghost"
                  className="text-xs"
                  disabled={pending}
                  onClick={() =>
                    run(() => archiveAssignmentAction(orgSlug, a.id))
                  }
                >
                  Archive
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
        {canAssign ? (
          detail.currentPublishedVersionId ? (
            <div className="flex flex-wrap items-end gap-3 border-t border-border-subtle px-5 py-3.5">
              <div className="min-w-64 flex-1">
                <Field
                  label={`Attach to ${lessonTerm.toLowerCase()}`}
                  htmlFor="assign-lesson"
                >
                  <Select
                    id="assign-lesson"
                    value={assignLesson}
                    onChange={(e) => setAssignLesson(e.target.value)}
                  >
                    <option value="">Choose…</option>
                    {lessons.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.courseTitle} · {l.title}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <Button
                variant="secondary"
                disabled={pending || assignLesson === ""}
                onClick={() =>
                  run(() =>
                    assignAssessmentAction(
                      orgSlug,
                      assignLesson,
                      detail.id,
                      true,
                    ),
                  )
                }
              >
                Attach (required)
              </Button>
            </div>
          ) : (
            <p className="border-t border-border-subtle px-5 py-3 text-caption text-text-muted">
              Publish a version before attaching this assessment to content.
            </p>
          )
        ) : null}
      </Card>

      <Card>
        <CardHeader
          title="Attempts"
          description="Latest attempts against any published version of this assessment."
        />
        {detail.attempts.length === 0 ? (
          <p className="px-5 py-4 text-body-sm text-text-muted">
            No attempts yet.
          </p>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {detail.attempts.map((a) => (
              <li
                key={a.id}
                className="flex items-center gap-3 px-5 py-2.5 text-body-sm"
              >
                <span className="flex-1 text-text-secondary">
                  Attempt {a.attemptNumber} ·{" "}
                  {new Date(a.startedAt).toLocaleString()}
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
        )}
      </Card>
    </div>
  );
}

function ItemFields({
  item,
  onChange,
  onRequiredChange,
}: {
  item: DraftItem;
  onChange: (patch: Record<string, unknown>) => void;
  onRequiredChange: (required: boolean) => void;
}) {
  const data = item.data;
  const options = (data.options ?? []) as { id: string; text: string }[];

  const promptField = (
    <Textarea
      aria-label="Prompt"
      rows={2}
      value={String(data.prompt ?? "")}
      onChange={(e) => onChange({ prompt: e.target.value })}
    />
  );
  const pointsField = (
    <Input
      aria-label="Points"
      type="number"
      min={0}
      max={1000}
      className="w-24"
      value={String(data.points ?? 0)}
      onChange={(e) => onChange({ points: Number(e.target.value) })}
    />
  );
  const requiredField = (
    <label className="flex items-center gap-2 text-body-sm text-text-secondary">
      <input
        type="checkbox"
        checked={item.required}
        onChange={(e) => onRequiredChange(e.target.checked)}
      />
      Required
    </label>
  );

  switch (item.type) {
    case "multiple_choice":
    case "multiple_select": {
      const isMulti = item.type === "multiple_select";
      const correctIds: string[] = isMulti
        ? ((data.correctOptionIds ?? []) as string[])
        : [String(data.correctOptionId ?? "")];
      const setCorrect = (optionId: string, checked: boolean) => {
        if (isMulti) {
          const next = checked
            ? [...new Set([...correctIds, optionId])]
            : correctIds.filter((id) => id !== optionId);
          onChange({ correctOptionIds: next });
        } else if (checked) {
          onChange({ correctOptionId: optionId });
        }
      };
      return (
        <div className="space-y-2">
          {promptField}
          <ul className="space-y-1.5">
            {options.map((option, oi) => (
              <li key={option.id} className="flex items-center gap-2">
                <input
                  type={isMulti ? "checkbox" : "radio"}
                  name={`correct-${item.id}`}
                  aria-label={`Option ${oi + 1} is correct`}
                  checked={correctIds.includes(option.id)}
                  onChange={(e) => setCorrect(option.id, e.target.checked)}
                />
                <Input
                  aria-label={`Option ${oi + 1} text`}
                  value={option.text}
                  onChange={(e) =>
                    onChange({
                      options: options.map((o) =>
                        o.id === option.id ? { ...o, text: e.target.value } : o,
                      ),
                    })
                  }
                />
                <Button
                  variant="ghost"
                  className="px-2 text-xs"
                  aria-label={`Remove option ${oi + 1}`}
                  disabled={options.length <= 2}
                  onClick={() => {
                    const patch: Record<string, unknown> = {
                      options: options.filter((o) => o.id !== option.id),
                    };
                    if (isMulti) {
                      patch.correctOptionIds = correctIds.filter(
                        (id) => id !== option.id,
                      );
                    }
                    onChange(patch);
                  }}
                >
                  ✕
                </Button>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="ghost"
              className="text-xs"
              disabled={options.length >= 10}
              onClick={() =>
                onChange({
                  options: [
                    ...options,
                    { id: crypto.randomUUID(), text: "New option" },
                  ],
                })
              }
            >
              + Option
            </Button>
            {isMulti ? (
              <label className="flex items-center gap-2 text-body-sm text-text-secondary">
                <input
                  type="checkbox"
                  checked={Boolean(data.partialCredit)}
                  onChange={(e) =>
                    onChange({ partialCredit: e.target.checked })
                  }
                />
                Partial credit
              </label>
            ) : null}
            {pointsField}
            {requiredField}
          </div>
        </div>
      );
    }
    case "true_false":
      return (
        <div className="space-y-2">
          {promptField}
          <div className="flex flex-wrap items-center gap-3">
            <Select
              aria-label="Correct answer"
              className="w-28"
              value={data.correctValue === false ? "false" : "true"}
              onChange={(e) =>
                onChange({ correctValue: e.target.value === "true" })
              }
            >
              <option value="true">True</option>
              <option value="false">False</option>
            </Select>
            {pointsField}
            {requiredField}
          </div>
        </div>
      );
    case "short_answer":
    case "long_answer":
      return (
        <div className="space-y-2">
          {promptField}
          <div className="flex flex-wrap items-center gap-3">
            <Input
              aria-label="Max length"
              type="number"
              min={1}
              max={item.type === "short_answer" ? 2000 : 20000}
              className="w-28"
              value={String(data.maxLength ?? "")}
              onChange={(e) => onChange({ maxLength: Number(e.target.value) })}
            />
            {pointsField}
            {requiredField}
          </div>
          <Textarea
            aria-label="Rubric (reviewer guidance, never shown to learners)"
            placeholder="Rubric (reviewer guidance, never shown to learners)"
            rows={2}
            value={String(data.rubric ?? "")}
            onChange={(e) =>
              onChange({
                rubric: e.target.value === "" ? undefined : e.target.value,
              })
            }
          />
        </div>
      );
    case "file_submission":
      return (
        <div className="space-y-2">
          {promptField}
          <Alert tone="info" title="Uploads deferred">
            File uploads arrive with the submissions bucket. Learners record a
            plain-text submission note; reviewers collect the file out of band.
          </Alert>
          <div className="flex flex-wrap items-center gap-3">
            {pointsField}
            {requiredField}
          </div>
          <Textarea
            aria-label="Rubric (reviewer guidance, never shown to learners)"
            placeholder="Rubric (reviewer guidance, never shown to learners)"
            rows={2}
            value={String(data.rubric ?? "")}
            onChange={(e) =>
              onChange({
                rubric: e.target.value === "" ? undefined : e.target.value,
              })
            }
          />
        </div>
      );
  }
}
