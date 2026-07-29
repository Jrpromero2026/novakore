"use client";

import { useMemo, useState, useTransition } from "react";
import {
  CURRENT_SCHEMA_VERSION,
  contentBlockSchema,
  type BlockType,
  type ContentBlock,
} from "@novakore/domain";
import {
  publishLessonAction,
  saveLessonBlocksAction,
} from "@/lib/actions/learning";
import {
  requestReviewAction,
  saveBlockToLibraryAction,
} from "@/lib/actions/studio";
import { idle, type ActionState } from "@/lib/actions/types";
import {
  ActionBanner,
  Badge,
  Button,
  Card,
  CardHeader,
  Input,
  Select,
  Textarea,
} from "@/components/ui/primitives";
import { Alert } from "@/components/ui/feedback";
import { BlockList } from "@/components/learning/block-renderer";

/**
 * Structured lesson editor: finite block types, per-type controlled fields,
 * keyboard reordering, live domain validation, safe preview through the one
 * shared renderer. No arbitrary HTML anywhere.
 */

type DraftBlock = {
  id: string;
  type: BlockType;
  schemaVersion: number;
  data: Record<string, unknown>;
  position: string;
};

const ADDABLE_TYPES: { type: BlockType; label: string }[] = [
  { type: "rich_text", label: "Text" },
  { type: "heading", label: "Heading" },
  { type: "callout", label: "Callout" },
  { type: "quote", label: "Quote" },
  { type: "checklist", label: "Checklist" },
  { type: "action_step", label: "Action step" },
  { type: "reflection", label: "Reflection" },
  { type: "accordion", label: "Accordion" },
  { type: "tabs", label: "Tabs" },
  { type: "timeline", label: "Timeline" },
  { type: "comparison", label: "Comparison" },
  { type: "flashcards", label: "Flashcards" },
  { type: "knowledge_check", label: "Knowledge check" },
  { type: "scenario", label: "Scenario" },
  { type: "video", label: "Video link" },
  { type: "file_link", label: "Resource link" },
  { type: "divider", label: "Divider" },
];

const uid = () => crypto.randomUUID();

function defaultData(type: BlockType): Record<string, unknown> {
  switch (type) {
    case "rich_text":
      return { text: "Write the lesson content here." };
    case "heading":
      return { text: "Section heading", level: 2 };
    case "callout":
      return { tone: "info", body: "Something worth highlighting." };
    case "quote":
      return { text: "A memorable quotation." };
    case "checklist":
      return { items: [{ id: uid(), text: "First step" }] };
    case "action_step":
      return { text: "Do this next." };
    case "reflection":
      return { prompt: "What stood out to you, and why?" };
    case "accordion":
      return { items: [{ id: uid(), title: "Section", body: "Details." }] };
    case "tabs":
      return {
        tabs: [
          { id: uid(), title: "Tab 1", body: "First tab." },
          { id: uid(), title: "Tab 2", body: "Second tab." },
        ],
      };
    case "timeline":
      return {
        events: [
          { id: uid(), label: "First", description: "What happened." },
          { id: uid(), label: "Then", description: "What followed." },
        ],
      };
    case "comparison":
      return {
        leftTitle: "Option A",
        rightTitle: "Option B",
        rows: [{ id: uid(), left: "Point", right: "Counterpoint" }],
      };
    case "flashcards":
      return { cards: [{ id: uid(), front: "Term", back: "Definition" }] };
    case "knowledge_check": {
      const correct = uid();
      return {
        prompt: "Which statement is correct?",
        options: [
          { id: correct, text: "The correct answer" },
          { id: uid(), text: "A distractor" },
        ],
        correctOptionId: correct,
      };
    }
    case "scenario":
      return {
        intro: "Set the scene here.",
        steps: [{ id: uid(), situation: "The first decision point." }],
      };
    case "video":
      return { url: "https://", title: "Video title" };
    case "file_link":
      return { url: "https://", label: "Resource" };
    default:
      return {};
  }
}

function nextPosition(blocks: DraftBlock[]): string {
  const last = [...blocks]
    .sort((a, b) => (a.position < b.position ? -1 : 1))
    .at(-1);
  return last ? `${last.position}n` : "a0";
}

export function LessonEditor({
  orgSlug,
  lessonId,
  initialBlocks,
  canPublish,
  canManageLibrary = false,
  published,
  comparison,
}: {
  orgSlug: string;
  lessonId: string;
  initialBlocks: ContentBlock[];
  canPublish: boolean;
  canManageLibrary?: boolean;
  published: { versionNumber: number; publishedAt: string } | null;
  comparison: {
    added: number;
    removed: number;
    changed: number;
    titleChanged: boolean;
  } | null;
}) {
  const [blocks, setBlocks] = useState<DraftBlock[]>(
    initialBlocks.map((b) => ({
      ...b,
      data: b.data as Record<string, unknown>,
    })),
  );
  const [dirty, setDirty] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [result, setResult] = useState<ActionState>(idle);
  const [pending, startTransition] = useTransition();

  const sorted = useMemo(
    () => [...blocks].sort((a, b) => (a.position < b.position ? -1 : 1)),
    [blocks],
  );
  const validation = useMemo(
    () =>
      sorted.map((b) => {
        const parsed = contentBlockSchema.safeParse(b);
        return parsed.success
          ? { id: b.id, ok: true as const, block: parsed.data }
          : {
              id: b.id,
              ok: false as const,
              error: parsed.error.issues[0]?.message ?? "invalid",
            };
      }),
    [sorted],
  );
  const allValid = validation.every((v) => v.ok);
  const validBlocks = validation.flatMap((v) => (v.ok ? [v.block] : []));

  const mutate = (updater: (draft: DraftBlock[]) => DraftBlock[]) => {
    setBlocks((current) => updater([...current]));
    setDirty(true);
  };
  const updateData = (id: string, patch: Record<string, unknown>) =>
    mutate((draft) =>
      draft.map((b) =>
        b.id === id ? { ...b, data: { ...b.data, ...patch } } : b,
      ),
    );
  const move = (index: number, delta: -1 | 1) =>
    mutate((draft) => {
      const ordered = [...draft].sort((a, b) =>
        a.position < b.position ? -1 : 1,
      );
      const a = ordered[index];
      const b = ordered[index + delta];
      if (!a || !b) return draft;
      return draft.map((block) =>
        block.id === a.id
          ? { ...block, position: b.position }
          : block.id === b.id
            ? { ...block, position: a.position }
            : block,
      );
    });

  const run = (fn: () => Promise<ActionState>) =>
    startTransition(async () => {
      const outcome = await fn();
      setResult(outcome);
      if (outcome.ok) setDirty(false);
    });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Status"
          description="Drafts are yours to shape; the published version is what learners see and never changes."
        />
        <div className="flex flex-wrap items-center gap-3 px-5 py-4">
          <Badge tone={published ? "positive" : "neutral"}>
            {published
              ? `Published v${published.versionNumber} · ${new Date(published.publishedAt).toLocaleString()}`
              : "Never published"}
          </Badge>
          <Badge tone={dirty ? "warning" : "neutral"}>
            {dirty ? "Unsaved edits" : "Saved"}
          </Badge>
          {comparison ? (
            <Badge
              tone={
                comparison.added + comparison.removed + comparison.changed >
                  0 || comparison.titleChanged
                  ? "accent"
                  : "neutral"
              }
            >
              Draft vs v{published?.versionNumber}: +{comparison.added} added, −
              {comparison.removed} removed, {comparison.changed} changed
              {comparison.titleChanged ? ", title changed" : ""}
            </Badge>
          ) : null}
          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="ghost"
              disabled={pending}
              onClick={() =>
                startTransition(async () =>
                  setResult(
                    await requestReviewAction(orgSlug, "lesson", lessonId, ""),
                  ),
                )
              }
            >
              Request review
            </Button>
            <Button
              variant="secondary"
              onClick={() => setShowPreview((v) => !v)}
              aria-pressed={showPreview}
            >
              {showPreview ? "Hide preview" : "Preview"}
            </Button>
            <Button
              variant="secondary"
              disabled={pending || !allValid}
              onClick={() =>
                run(() =>
                  saveLessonBlocksAction(
                    orgSlug,
                    lessonId,
                    sorted.map((b) => ({
                      id: b.id,
                      type: b.type,
                      schemaVersion: b.schemaVersion,
                      data: b.data,
                      position: b.position,
                    })),
                  ),
                )
              }
            >
              {pending ? "Working…" : "Save draft"}
            </Button>
            {canPublish ? (
              <Button
                disabled={pending || !allValid || blocks.length === 0}
                onClick={() =>
                  run(async () => {
                    const saved = await saveLessonBlocksAction(
                      orgSlug,
                      lessonId,
                      sorted.map((b) => ({
                        id: b.id,
                        type: b.type,
                        schemaVersion: b.schemaVersion,
                        data: b.data,
                        position: b.position,
                      })),
                    );
                    if (!saved.ok) return saved;
                    return publishLessonAction(orgSlug, lessonId);
                  })
                }
              >
                Publish lesson
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
          title="Blocks"
          description="Finite, validated block types. Text supports **bold**, *italic*, and https links — never raw HTML."
        />
        <ul className="divide-y divide-border-subtle">
          {sorted.map((block, index) => {
            const check = validation[index]!;
            return (
              <li key={block.id} className="space-y-2 px-5 py-4">
                <div className="flex items-center gap-2">
                  <Badge tone="neutral">{block.type.replace(/_/g, " ")}</Badge>
                  {!check.ok ? <Badge tone="danger">invalid</Badge> : null}
                  <span className="ml-auto flex gap-1">
                    <Button
                      variant="ghost"
                      className="px-2 text-xs"
                      aria-label="Move block up"
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                    >
                      ↑
                    </Button>
                    <Button
                      variant="ghost"
                      className="px-2 text-xs"
                      aria-label="Move block down"
                      disabled={index === sorted.length - 1}
                      onClick={() => move(index, 1)}
                    >
                      ↓
                    </Button>
                    <Button
                      variant="ghost"
                      className="px-2 text-xs"
                      aria-label="Duplicate block"
                      onClick={() =>
                        mutate((draft) => [
                          ...draft,
                          {
                            ...block,
                            id: crypto.randomUUID(),
                            data: structuredClone(block.data),
                            position: nextPosition(draft),
                          },
                        ])
                      }
                    >
                      ⧉
                    </Button>
                    {canManageLibrary && check.ok ? (
                      <Button
                        variant="ghost"
                        className="px-2 text-xs"
                        aria-label="Save block to library"
                        title="Save to reusable library"
                        onClick={() =>
                          startTransition(async () =>
                            setResult(
                              await saveBlockToLibraryAction(orgSlug, {
                                title: `${block.type.replace(/_/g, " ")} block`,
                                blockType: block.type,
                                schemaVersion: block.schemaVersion,
                                data: block.data,
                                tags: [],
                              }),
                            ),
                          )
                        }
                      >
                        ★
                      </Button>
                    ) : null}
                    <Button
                      variant="danger"
                      className="px-2 text-xs"
                      aria-label="Delete block"
                      onClick={() =>
                        mutate((draft) =>
                          draft.filter((b) => b.id !== block.id),
                        )
                      }
                    >
                      ✕
                    </Button>
                  </span>
                </div>

                <BlockFields
                  block={block}
                  onChange={(patch) => updateData(block.id, patch)}
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
          {ADDABLE_TYPES.map(({ type, label }) => (
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
                    schemaVersion: CURRENT_SCHEMA_VERSION[type],
                    data: defaultData(type),
                    position: nextPosition(draft),
                  },
                ])
              }
            >
              + {label}
            </Button>
          ))}
        </div>
      </Card>

      {showPreview ? (
        <Card>
          <CardHeader
            title="Preview"
            description="Rendered by the same block renderer learners see."
          />
          <div className="px-5 py-5">
            {allValid ? (
              <BlockList blocks={validBlocks} />
            ) : (
              <Alert tone="warning" title="Preview limited">
                Invalid blocks are hidden until fixed.
              </Alert>
            )}
          </div>
        </Card>
      ) : null}
    </div>
  );
}

function BlockFields({
  block,
  onChange,
}: {
  block: DraftBlock;
  onChange: (patch: Record<string, unknown>) => void;
}) {
  const data = block.data as Record<string, unknown>;
  switch (block.type) {
    case "rich_text":
      return (
        <Textarea
          aria-label="Text content"
          rows={4}
          value={String(data.text ?? "")}
          onChange={(e) => onChange({ text: e.target.value })}
        />
      );
    case "heading":
      return (
        <div className="flex gap-2">
          <Input
            aria-label="Heading text"
            value={String(data.text ?? "")}
            onChange={(e) => onChange({ text: e.target.value })}
          />
          <Select
            aria-label="Heading level"
            className="w-28"
            value={String(data.level ?? 2)}
            onChange={(e) => onChange({ level: Number(e.target.value) })}
          >
            <option value="2">H2</option>
            <option value="3">H3</option>
          </Select>
        </div>
      );
    case "callout":
      return (
        <div className="space-y-2">
          <div className="flex gap-2">
            <Select
              aria-label="Callout tone"
              className="w-36"
              value={String(data.tone ?? "info")}
              onChange={(e) => onChange({ tone: e.target.value })}
            >
              {["info", "success", "warning", "danger", "note"].map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
            <Input
              aria-label="Callout title (optional)"
              placeholder="Title (optional)"
              value={String(data.title ?? "")}
              onChange={(e) =>
                onChange({
                  title: e.target.value === "" ? undefined : e.target.value,
                })
              }
            />
          </div>
          <Textarea
            aria-label="Callout body"
            rows={2}
            value={String(data.body ?? "")}
            onChange={(e) => onChange({ body: e.target.value })}
          />
        </div>
      );
    case "checklist": {
      const items = (data.items ?? []) as { id: string; text: string }[];
      return (
        <Textarea
          aria-label="Checklist items (one per line)"
          rows={Math.max(2, items.length)}
          value={items.map((i) => i.text).join("\n")}
          onChange={(e) =>
            onChange({
              items: e.target.value
                .split("\n")
                .filter((line) => line.trim().length > 0)
                .map((text, i) => ({
                  id: items[i]?.id ?? crypto.randomUUID(),
                  text,
                })),
            })
          }
        />
      );
    }
    case "quote":
      return (
        <div className="space-y-2">
          <Textarea
            aria-label="Quote text"
            rows={2}
            value={String(data.text ?? "")}
            onChange={(e) => onChange({ text: e.target.value })}
          />
          <Input
            aria-label="Attribution (optional)"
            placeholder="Attribution (optional)"
            value={String(data.attribution ?? "")}
            onChange={(e) =>
              onChange({
                attribution: e.target.value === "" ? undefined : e.target.value,
              })
            }
          />
        </div>
      );
    case "action_step":
      return (
        <div className="space-y-2">
          <Input
            aria-label="Action step"
            value={String(data.text ?? "")}
            onChange={(e) => onChange({ text: e.target.value })}
          />
          <Textarea
            aria-label="Note (optional)"
            placeholder="Note (optional)"
            rows={2}
            value={String(data.note ?? "")}
            onChange={(e) =>
              onChange({
                note: e.target.value === "" ? undefined : e.target.value,
              })
            }
          />
        </div>
      );
    case "reflection":
      return (
        <div className="space-y-2">
          <Textarea
            aria-label="Reflection prompt"
            rows={2}
            value={String(data.prompt ?? "")}
            onChange={(e) => onChange({ prompt: e.target.value })}
          />
          <Textarea
            aria-label="Guidance (optional)"
            placeholder="Guidance (optional)"
            rows={2}
            value={String(data.guidance ?? "")}
            onChange={(e) =>
              onChange({
                guidance: e.target.value === "" ? undefined : e.target.value,
              })
            }
          />
        </div>
      );
    case "flashcards": {
      const cards = (data.cards ?? []) as {
        id: string;
        front: string;
        back: string;
      }[];
      return (
        <PairListEditor
          label="Flashcards (front | back per line)"
          leftKey="front"
          rightKey="back"
          rows={cards.map((c) => ({ id: c.id, left: c.front, right: c.back }))}
          onChange={(rows) =>
            onChange({
              cards: rows.map((r) => ({
                id: r.id,
                front: r.left,
                back: r.right,
              })),
            })
          }
        />
      );
    }
    case "comparison": {
      const rows = (data.rows ?? []) as {
        id: string;
        left: string;
        right: string;
      }[];
      return (
        <div className="space-y-2">
          <div className="grid gap-2 sm:grid-cols-2">
            <Input
              aria-label="Left column title"
              value={String(data.leftTitle ?? "")}
              onChange={(e) => onChange({ leftTitle: e.target.value })}
            />
            <Input
              aria-label="Right column title"
              value={String(data.rightTitle ?? "")}
              onChange={(e) => onChange({ rightTitle: e.target.value })}
            />
          </div>
          <PairListEditor
            label="Rows (left | right per line)"
            leftKey="left"
            rightKey="right"
            rows={rows.map((r) => ({ id: r.id, left: r.left, right: r.right }))}
            onChange={(next) => onChange({ rows: next })}
          />
        </div>
      );
    }
    case "accordion": {
      const items = (data.items ?? []) as {
        id: string;
        title: string;
        body: string;
      }[];
      return (
        <PairListEditor
          label="Sections (title | body per line)"
          leftKey="title"
          rightKey="body"
          rows={items.map((i) => ({ id: i.id, left: i.title, right: i.body }))}
          onChange={(rows) =>
            onChange({
              items: rows.map((r) => ({
                id: r.id,
                title: r.left,
                body: r.right,
              })),
            })
          }
        />
      );
    }
    case "tabs": {
      const tabs = (data.tabs ?? []) as {
        id: string;
        title: string;
        body: string;
      }[];
      return (
        <PairListEditor
          label="Tabs (title | body per line, ≥2)"
          leftKey="title"
          rightKey="body"
          rows={tabs.map((t) => ({ id: t.id, left: t.title, right: t.body }))}
          onChange={(rows) =>
            onChange({
              tabs: rows.map((r) => ({
                id: r.id,
                title: r.left,
                body: r.right,
              })),
            })
          }
        />
      );
    }
    case "timeline": {
      const events = (data.events ?? []) as {
        id: string;
        label: string;
        description: string;
      }[];
      return (
        <PairListEditor
          label="Events (label | description per line, ≥2)"
          leftKey="label"
          rightKey="description"
          rows={events.map((ev) => ({
            id: ev.id,
            left: ev.label,
            right: ev.description,
          }))}
          onChange={(rows) =>
            onChange({
              events: rows.map((r) => ({
                id: r.id,
                label: r.left,
                description: r.right,
              })),
            })
          }
        />
      );
    }
    case "knowledge_check": {
      const options = (data.options ?? []) as { id: string; text: string }[];
      const correctId = String(data.correctOptionId ?? "");
      return (
        <div className="space-y-2">
          <Textarea
            aria-label="Knowledge check prompt"
            rows={2}
            value={String(data.prompt ?? "")}
            onChange={(e) => onChange({ prompt: e.target.value })}
          />
          <ul className="space-y-1.5">
            {options.map((option, oi) => (
              <li key={option.id} className="flex items-center gap-2">
                <input
                  type="radio"
                  name={`kc-${String(data.__id ?? "")}-${oi}`}
                  aria-label={`Option ${oi + 1} is correct`}
                  checked={option.id === correctId}
                  onChange={() => onChange({ correctOptionId: option.id })}
                />
                <Input
                  aria-label={`Option ${oi + 1}`}
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
                  onClick={() =>
                    onChange({
                      options: options.filter((o) => o.id !== option.id),
                    })
                  }
                >
                  ✕
                </Button>
              </li>
            ))}
          </ul>
          <Button
            variant="ghost"
            className="text-xs"
            disabled={options.length >= 6}
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
          <Textarea
            aria-label="Explanation (optional)"
            placeholder="Explanation shown after answering (optional)"
            rows={2}
            value={String(data.explanation ?? "")}
            onChange={(e) =>
              onChange({
                explanation: e.target.value === "" ? undefined : e.target.value,
              })
            }
          />
        </div>
      );
    }
    case "scenario": {
      const steps = (data.steps ?? []) as {
        id: string;
        situation: string;
        consideration?: string;
      }[];
      return (
        <div className="space-y-2">
          <Textarea
            aria-label="Scenario intro"
            rows={2}
            value={String(data.intro ?? "")}
            onChange={(e) => onChange({ intro: e.target.value })}
          />
          <Textarea
            aria-label="Scenario steps (one situation per line)"
            rows={Math.max(2, steps.length)}
            value={steps.map((s) => s.situation).join("\n")}
            onChange={(e) =>
              onChange({
                steps: e.target.value
                  .split("\n")
                  .filter((line) => line.trim().length > 0)
                  .map((situation, i) => ({
                    id: steps[i]?.id ?? crypto.randomUUID(),
                    situation,
                    ...(steps[i]?.consideration
                      ? { consideration: steps[i]!.consideration }
                      : {}),
                  })),
              })
            }
          />
          <Textarea
            aria-label="Debrief (optional)"
            placeholder="Debrief (optional)"
            rows={2}
            value={String(data.debrief ?? "")}
            onChange={(e) =>
              onChange({
                debrief: e.target.value === "" ? undefined : e.target.value,
              })
            }
          />
        </div>
      );
    }
    case "video":
      return (
        <div className="grid gap-2 sm:grid-cols-2">
          <Input
            aria-label="Video URL (https)"
            placeholder="https://…"
            value={String(data.url ?? "")}
            onChange={(e) => onChange({ url: e.target.value })}
            className="font-mono"
          />
          <Input
            aria-label="Video title"
            placeholder="Title"
            value={String(data.title ?? "")}
            onChange={(e) => onChange({ title: e.target.value })}
          />
        </div>
      );
    case "file_link":
      return (
        <div className="grid gap-2 sm:grid-cols-2">
          <Input
            aria-label="Resource URL (https)"
            placeholder="https://…"
            value={String(data.url ?? "")}
            onChange={(e) => onChange({ url: e.target.value })}
            className="font-mono"
          />
          <Input
            aria-label="Resource label"
            placeholder="Label"
            value={String(data.label ?? "")}
            onChange={(e) => onChange({ label: e.target.value })}
          />
        </div>
      );
    case "divider":
      return <hr className="border-border-default" />;
    default:
      return (
        <p className="text-caption text-text-muted">
          This block type is edited elsewhere.
        </p>
      );
  }
}

/**
 * Compact editor for list-of-pairs blocks (flashcards, accordion, tabs,
 * timeline, comparison rows). One `left | right` per line — stable ids are
 * preserved by position, matching the checklist pattern.
 */
function PairListEditor({
  label,
  rows,
  onChange,
}: {
  label: string;
  leftKey: string;
  rightKey: string;
  rows: { id: string; left: string; right: string }[];
  onChange: (rows: { id: string; left: string; right: string }[]) => void;
}) {
  return (
    <Textarea
      aria-label={label}
      placeholder={label}
      rows={Math.max(2, rows.length + 1)}
      value={rows.map((r) => `${r.left} | ${r.right}`).join("\n")}
      onChange={(e) =>
        onChange(
          e.target.value
            .split("\n")
            .filter((line) => line.trim().length > 0)
            .map((line, i) => {
              const [left, ...rest] = line.split("|");
              return {
                id: rows[i]?.id ?? crypto.randomUUID(),
                left: (left ?? "").trim(),
                right: rest.join("|").trim(),
              };
            }),
        )
      }
    />
  );
}
