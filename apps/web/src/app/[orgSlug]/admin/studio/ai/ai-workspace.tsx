"use client";

import { useState, useTransition } from "react";
import { useActionState } from "react";
import type { AiOperation } from "@novakore/domain";
import {
  acceptGenerationAction,
  rejectGenerationAction,
  runGenerationAction,
} from "@/lib/actions/ai";
import {
  approveSourceDocumentAction,
  createSourceDocumentAction,
} from "@/lib/actions/studio";
import { idle, type ActionState } from "@/lib/actions/types";
import type { AiWorkspaceData } from "@/lib/data/studio";
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

const OPERATIONS: {
  value: AiOperation;
  label: string;
  profile: "drafting" | "structured" | "rewrite";
}[] = [
  {
    value: "path_outline",
    label: "Learning-path outline",
    profile: "structured",
  },
  {
    value: "course_outline",
    label: "Course outline (creates draft)",
    profile: "structured",
  },
  {
    value: "module_suggestions",
    label: "Module suggestions",
    profile: "structured",
  },
  {
    value: "lesson_draft",
    label: "Lesson draft (creates draft lesson)",
    profile: "drafting",
  },
  {
    value: "source_to_blocks",
    label: "Convert source to blocks",
    profile: "drafting",
  },
  {
    value: "knowledge_checks",
    label: "Knowledge checks",
    profile: "structured",
  },
  {
    value: "assessment_questions",
    label: "Assessment questions",
    profile: "structured",
  },
  { value: "flashcards", label: "Flashcards", profile: "structured" },
  { value: "scenario", label: "Scenario", profile: "drafting" },
  {
    value: "reflection_prompts",
    label: "Reflection prompts",
    profile: "structured",
  },
  { value: "summarize_source", label: "Summarize source", profile: "rewrite" },
  {
    value: "rewrite_audience",
    label: "Rewrite for audience",
    profile: "rewrite",
  },
  {
    value: "rewrite_reading_level",
    label: "Rewrite for reading level",
    profile: "rewrite",
  },
  {
    value: "prerequisite_suggestions",
    label: "Suggest prerequisites",
    profile: "structured",
  },
  {
    value: "gap_analysis",
    label: "Identify content gaps",
    profile: "structured",
  },
];

const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export function AiWorkspace({
  orgSlug,
  data,
  canGenerate,
  canManageSources,
  canAuthor,
  provider,
}: {
  orgSlug: string;
  data: AiWorkspaceData;
  canGenerate: boolean;
  canManageSources: boolean;
  canAuthor: boolean;
  provider: string;
}) {
  const [operation, setOperation] = useState<AiOperation>("course_outline");
  const [objective, setObjective] = useState("");
  const [audience, setAudience] = useState("");
  const [inputText, setInputText] = useState("");
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [runState, setRunState] = useState<ActionState>(idle);
  const [pending, startTransition] = useTransition();
  const [acceptTarget, setAcceptTarget] = useState<
    Record<string, { lessonId?: string; moduleId?: string; courseId?: string }>
  >({});

  const [sourceState, sourceAction, sourcePending] = useActionState(
    createSourceDocumentAction.bind(null, orgSlug),
    idle,
  );

  const config = OPERATIONS.find((o) => o.value === operation)!;
  const remaining = data.limitCents - data.usedCents - data.reservedCents;
  const usedPct = Math.min(
    100,
    Math.round(((data.usedCents + data.reservedCents) / data.limitCents) * 100),
  );
  const budgetBlocked = remaining <= 0;
  const needsSource =
    operation === "summarize_source" || operation === "source_to_blocks";
  const needsInput =
    operation === "rewrite_audience" || operation === "rewrite_reading_level";

  const run = (fn: () => Promise<ActionState>) =>
    startTransition(async () => setRunState(await fn()));

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {/* Budget + request column */}
      <div className="space-y-4 lg:col-span-2">
        <Card>
          <CardHeader
            title="Generate a draft"
            description={`Provider: ${provider}. Every generation is validated, budgeted, and always a draft — AI never publishes.`}
          />
          <div className="space-y-3 px-5 py-4">
            {provider === "mock" || provider === "deterministic" ? (
              <Alert tone="info" title="Development provider">
                No live AI credentials are configured, so the{" "}
                <strong>{provider}</strong> provider returns realistic fixture
                content. To enable live generation, set{" "}
                <code>NOVAKORE_AI_PROVIDER=anthropic</code> and{" "}
                <code>ANTHROPIC_API_KEY</code> in the server environment.
              </Alert>
            ) : null}
            {budgetBlocked ? (
              <Alert tone="warning" title="Monthly AI budget reached">
                Generation is blocked until next month or a limit change. Used{" "}
                {dollars(data.usedCents)} of {dollars(data.limitCents)}.
              </Alert>
            ) : null}

            <Field label="What do you want to create?" htmlFor="ai-operation">
              <Select
                id="ai-operation"
                value={operation}
                onChange={(e) => setOperation(e.target.value as AiOperation)}
              >
                {OPERATIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Objective" htmlFor="ai-objective">
              <Textarea
                id="ai-objective"
                rows={2}
                value={objective}
                onChange={(e) => setObjective(e.target.value)}
                placeholder="e.g. Onboard new coaches to the movement-screening process"
              />
            </Field>

            <Field label="Audience (optional)" htmlFor="ai-audience">
              <Input
                id="ai-audience"
                value={audience}
                onChange={(e) => setAudience(e.target.value)}
                placeholder="e.g. New coaches with no clinical background"
              />
            </Field>

            {needsInput ? (
              <Field label="Text to rewrite" htmlFor="ai-input">
                <Textarea
                  id="ai-input"
                  rows={4}
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                />
              </Field>
            ) : null}

            <fieldset>
              <legend className="mb-1 text-caption text-text-muted">
                Sources {needsSource ? "(required)" : "(optional)"}
              </legend>
              {data.sources.length === 0 ? (
                <p className="text-body-sm text-text-muted">
                  No source documents yet. Add one on the right — the model only
                  ever sees the sources you attach here.
                </p>
              ) : (
                <ul className="space-y-1">
                  {data.sources.map((source) => (
                    <li key={source.id} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id={`src-${source.id}`}
                        checked={selectedSources.includes(source.id)}
                        disabled={!source.hasContent}
                        onChange={(e) =>
                          setSelectedSources((s) =>
                            e.target.checked
                              ? [...s, source.id]
                              : s.filter((id) => id !== source.id),
                          )
                        }
                      />
                      <label
                        htmlFor={`src-${source.id}`}
                        className="text-body-sm text-text-primary"
                      >
                        {source.title}
                      </label>
                      {source.reviewState === "approved" ? (
                        <Badge tone="positive">approved</Badge>
                      ) : (
                        <Badge tone="neutral">unreviewed</Badge>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {selectedSources.length === 0 && !needsSource ? (
                <p className="mt-1 text-caption text-warning">
                  No source attached — the model will draft from general
                  knowledge. Attach a source for grounded content.
                </p>
              ) : null}
            </fieldset>

            <ActionBanner state={runState} />
            {canGenerate ? (
              <Button
                disabled={
                  pending ||
                  budgetBlocked ||
                  objective.trim().length === 0 ||
                  (needsSource && selectedSources.length === 0) ||
                  (needsInput && inputText.trim().length === 0)
                }
                onClick={() =>
                  run(() =>
                    runGenerationAction(orgSlug, {
                      operation,
                      profile: config.profile,
                      objective,
                      audience: audience.trim() || undefined,
                      sourceDocumentIds: selectedSources,
                      inputText: needsInput ? inputText : undefined,
                    }),
                  )
                }
              >
                {pending ? "Generating…" : "Generate draft"}
              </Button>
            ) : (
              <p className="text-caption text-text-muted">
                Generating requires the ai.author.use permission.
              </p>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Generation history" />
          {data.generations.length === 0 ? (
            <p className="px-5 py-4 text-body-sm text-text-muted">
              No generations yet.
            </p>
          ) : (
            <ul className="divide-y divide-border-subtle">
              {data.generations.map((generation) => (
                <li key={generation.id} className="space-y-2 px-5 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="min-w-0 flex-1 text-body-sm text-text-primary">
                      {generation.operation.replace(/_/g, " ")} ·{" "}
                      <span className="text-text-muted">
                        {generation.objective.slice(0, 60)}
                      </span>
                    </span>
                    <span className="font-mono text-caption text-text-muted">
                      {generation.actualCents !== null
                        ? dollars(generation.actualCents)
                        : `~${dollars(generation.reservedCents)}`}
                    </span>
                    <Badge
                      tone={
                        generation.status === "accepted" ||
                        generation.status === "completed"
                          ? "positive"
                          : generation.status === "failed"
                            ? "danger"
                            : generation.status === "rejected"
                              ? "neutral"
                              : "warning"
                      }
                    >
                      {generation.status}
                    </Badge>
                  </div>
                  {generation.error ? (
                    <p className="text-caption text-danger">
                      {generation.error}
                    </p>
                  ) : null}
                  {generation.status === "completed" && canAuthor ? (
                    <AcceptControls
                      orgSlug={orgSlug}
                      generation={generation}
                      lessons={data.lessons}
                      modules={data.modules}
                      target={acceptTarget[generation.id] ?? {}}
                      setTarget={(t) =>
                        setAcceptTarget((s) => ({ ...s, [generation.id]: t }))
                      }
                      onDone={setRunState}
                    />
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Budget + sources sidebar */}
      <div className="space-y-4">
        <Card>
          <CardHeader
            title="AI budget"
            description={`${data.monthKey} · hard-capped`}
          />
          <div className="space-y-2 px-5 py-4">
            <div className="h-2 overflow-hidden rounded-full bg-background-subtle">
              <div
                className={`h-full ${usedPct >= 100 ? "bg-danger" : usedPct >= 80 ? "bg-warning" : "bg-accent"}`}
                style={{ width: `${usedPct}%` }}
              />
            </div>
            <p className="text-body-sm text-text-secondary">
              {dollars(data.usedCents + data.reservedCents)} of{" "}
              {dollars(data.limitCents)} used ({dollars(remaining)} left)
            </p>
            <p className="text-caption text-text-muted">
              Costs are development estimates until reconciled against provider
              invoices. Platform cap: {dollars(5000)}/month.
            </p>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Source documents"
            description="Tenant-owned; never shared across organizations."
          />
          <ul className="divide-y divide-border-subtle">
            {data.sources.map((source) => (
              <li
                key={source.id}
                className="flex items-center gap-2 px-5 py-2.5 text-body-sm"
              >
                <span className="min-w-0 flex-1 truncate text-text-primary">
                  {source.title}
                </span>
                <Badge tone="neutral">{source.kind}</Badge>
                {canManageSources && source.reviewState !== "approved" ? (
                  <Button
                    variant="ghost"
                    className="text-xs"
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () =>
                        setRunState(
                          await approveSourceDocumentAction(orgSlug, source.id),
                        ),
                      )
                    }
                  >
                    Approve
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
          {canManageSources ? (
            <form
              action={sourceAction}
              className="space-y-2 border-t border-border-subtle px-5 py-4"
            >
              <Field
                label="Title"
                htmlFor="src-title"
                error={sourceState.errors?.title}
              >
                <Input id="src-title" name="title" required />
              </Field>
              <input type="hidden" name="kind" value="markdown" />
              <Field label="Content (text or markdown)" htmlFor="src-content">
                <Textarea id="src-content" name="content" rows={4} required />
              </Field>
              <Field label="Provenance (optional)" htmlFor="src-provenance">
                <Input
                  id="src-provenance"
                  name="provenance"
                  placeholder="Where this came from"
                />
              </Field>
              <Alert tone="info" title="PDF extraction is limited">
                Uploaded PDFs are stored but not automatically parsed in this
                phase. Paste text or markdown here for grounded generation.
              </Alert>
              <ActionBanner state={sourceState} />
              <Button
                type="submit"
                variant="secondary"
                disabled={sourcePending}
              >
                {sourcePending ? "Adding…" : "Add source"}
              </Button>
            </form>
          ) : null}
        </Card>
      </div>
    </div>
  );
}

function AcceptControls({
  orgSlug,
  generation,
  lessons,
  modules,
  target,
  setTarget,
  onDone,
}: {
  orgSlug: string;
  generation: AiWorkspaceData["generations"][number];
  lessons: AiWorkspaceData["lessons"];
  modules: AiWorkspaceData["modules"];
  target: { lessonId?: string; moduleId?: string; courseId?: string };
  setTarget: (t: {
    lessonId?: string;
    moduleId?: string;
    courseId?: string;
  }) => void;
  onDone: (s: ActionState) => void;
}) {
  const [pending, startTransition] = useTransition();
  const op = generation.operation;
  const needsModule = op === "lesson_draft" || op === "source_to_blocks";
  const needsLesson = [
    "knowledge_checks",
    "assessment_questions",
    "flashcards",
    "scenario",
    "reflection_prompts",
  ].includes(op);

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-md bg-background-subtle px-3 py-2">
      {needsModule ? (
        <Select
          aria-label="Target module"
          className="min-w-40 flex-1"
          value={target.moduleId ?? ""}
          onChange={(e) => {
            const picked = modules.find((m) => m.id === e.target.value);
            setTarget({ moduleId: picked?.id, courseId: picked?.courseId });
          }}
        >
          <option value="">Choose module…</option>
          {modules.map((m) => (
            <option key={m.id} value={m.id}>
              {m.courseTitle} · {m.title}
            </option>
          ))}
        </Select>
      ) : null}
      {needsLesson ? (
        <Select
          aria-label="Target lesson"
          className="min-w-40 flex-1"
          value={target.lessonId ?? ""}
          onChange={(e) => setTarget({ lessonId: e.target.value })}
        >
          <option value="">Choose lesson…</option>
          {lessons.map((l) => (
            <option key={l.id} value={l.id}>
              {l.courseTitle} · {l.title}
            </option>
          ))}
        </Select>
      ) : null}
      <Button
        variant="secondary"
        className="text-xs"
        disabled={
          pending ||
          (needsModule && !target.moduleId) ||
          (needsLesson && !target.lessonId)
        }
        onClick={() =>
          startTransition(async () =>
            onDone(
              await acceptGenerationAction(orgSlug, generation.id, target),
            ),
          )
        }
      >
        Accept as draft
      </Button>
      <Button
        variant="ghost"
        className="text-xs"
        disabled={pending}
        onClick={() =>
          startTransition(async () =>
            onDone(await rejectGenerationAction(orgSlug, generation.id)),
          )
        }
      >
        Reject
      </Button>
    </div>
  );
}
