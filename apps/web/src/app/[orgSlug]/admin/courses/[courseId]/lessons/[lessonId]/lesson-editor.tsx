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
  { type: "checklist", label: "Checklist" },
  { type: "video", label: "Video link" },
  { type: "file_link", label: "Resource link" },
  { type: "divider", label: "Divider" },
];

function defaultData(type: BlockType): Record<string, unknown> {
  switch (type) {
    case "rich_text":
      return { text: "Write the lesson content here." };
    case "heading":
      return { text: "Section heading", level: 2 };
    case "callout":
      return { tone: "info", body: "Something worth highlighting." };
    case "checklist":
      return { items: [{ id: crypto.randomUUID(), text: "First step" }] };
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
  published,
  comparison,
}: {
  orgSlug: string;
  lessonId: string;
  initialBlocks: ContentBlock[];
  canPublish: boolean;
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
  const data = block.data as Record<
    string,
    string | number | boolean | { id: string; text: string }[]
  >;
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
