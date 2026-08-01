"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
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
import type { LessonWorkspaceData } from "@/lib/data/studio";
import { assessLessonHealth } from "@/lib/lesson-health";
import {
  ActionBanner,
  Badge,
  Button,
  Input,
  Select,
  Textarea,
  cx,
} from "@/components/ui/primitives";
import { Alert } from "@/components/ui/feedback";
import {
  IconAi,
  IconCourse,
  IconPath,
  IconReview,
  IconSearch,
} from "@/components/ui/icons";
import { BlockList } from "@/components/learning/block-renderer";

/**
 * Knowledge IDE lesson workspace (experience-design-system.md §knowledge-ide).
 *
 * Three panels: the knowledge tree (structure), the canvas (content becomes
 * the interface — .nk-canvas hides field chrome until intent), and the
 * inspector (health coaching, real version history, real review activity,
 * and the publish ceremony). The block machinery is unchanged: finite
 * validated types, live domain validation, keyboard reordering, the one
 * shared renderer for preview. No arbitrary HTML anywhere.
 */

type DraftBlock = {
  id: string;
  type: BlockType;
  schemaVersion: number;
  data: Record<string, unknown>;
  position: string;
};

const ADDABLE_TYPES: { type: BlockType; label: string; hint: string }[] = [
  { type: "rich_text", label: "Text", hint: "Paragraphs with **bold** links" },
  { type: "heading", label: "Heading", hint: "Section structure" },
  { type: "callout", label: "Callout", hint: "Highlight what matters" },
  { type: "quote", label: "Quote", hint: "A voice worth hearing" },
  { type: "checklist", label: "Checklist", hint: "Steps to complete" },
  { type: "action_step", label: "Action step", hint: "Do this next" },
  { type: "reflection", label: "Reflection", hint: "Prompt thinking" },
  { type: "accordion", label: "Accordion", hint: "Collapsible sections" },
  { type: "tabs", label: "Tabs", hint: "Parallel content" },
  { type: "timeline", label: "Timeline", hint: "Events in order" },
  { type: "comparison", label: "Comparison", hint: "Side by side" },
  { type: "flashcards", label: "Flashcards", hint: "Term and definition" },
  {
    type: "knowledge_check",
    label: "Knowledge check",
    hint: "Confirm it landed",
  },
  { type: "scenario", label: "Scenario", hint: "Decisions in context" },
  { type: "video", label: "Video link", hint: "Embed by URL" },
  { type: "file_link", label: "Resource link", hint: "Downloadable reference" },
  { type: "divider", label: "Divider", hint: "Visual break" },
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
  lessonTitle,
  initialBlocks,
  canPublish,
  canManageLibrary = false,
  published,
  comparison,
  workspace,
}: {
  orgSlug: string;
  lessonId: string;
  lessonTitle?: string;
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
  workspace?: LessonWorkspaceData;
}) {
  const [blocks, setBlocks] = useState<DraftBlock[]>(
    initialBlocks.map((b) => ({
      ...b,
      data: b.data as Record<string, unknown>,
    })),
  );
  const [dirty, setDirty] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [slashOpen, setSlashOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [justPublished, setJustPublished] = useState<number | null>(null);
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
  const health = useMemo(
    () =>
      assessLessonHealth(
        sorted.map((b, i) => ({
          type: b.type,
          data: b.data,
          valid: validation[i]?.ok ?? false,
        })),
      ),
    [sorted, validation],
  );

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
  const insertBlock = (type: BlockType) =>
    mutate((draft) => [
      ...draft,
      {
        id: crypto.randomUUID(),
        type,
        schemaVersion: CURRENT_SCHEMA_VERSION[type],
        data: defaultData(type),
        position: nextPosition(draft),
      },
    ]);

  const run = (fn: () => Promise<ActionState>) =>
    startTransition(async () => {
      const outcome = await fn();
      setResult(outcome);
      if (outcome.ok) setDirty(false);
    });

  const saveDraft = () =>
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
    );

  const publishNow = () =>
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
      const outcome = await publishLessonAction(orgSlug, lessonId);
      if (outcome.ok) {
        setPublishOpen(false);
        setJustPublished((published?.versionNumber ?? 0) + 1);
      }
      return outcome;
    });

  // Author shortcuts — event-driven, re-registered per render so handlers
  // close over the latest state (no setState in the effect body itself).
  // ⌘/Ctrl+S saves; "/" outside a field opens block insertion.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (!pending && allValid) saveDraft();
        return;
      }
      const target = event.target as HTMLElement | null;
      const inField =
        target?.closest("input, textarea, select, [role=dialog]") != null;
      if (event.key === "/" && !inField) {
        event.preventDefault();
        setSlashOpen(true);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const canPublishNow = allValid && blocks.length > 0 && !pending;
  const nextVersion = (published?.versionNumber ?? 0) + 1;

  return (
    <div
      className={cx(
        "gap-6 lg:grid",
        focusMode
          ? "lg:grid-cols-1"
          : workspace
            ? "lg:grid-cols-[14rem_minmax(0,1fr)_17rem]"
            : "lg:grid-cols-[minmax(0,1fr)_17rem]",
      )}
    >
      {/* ---- Knowledge tree ---------------------------------------------- */}
      {workspace && !focusMode ? (
        <KnowledgeTree
          workspace={workspace}
          orgSlug={orgSlug}
          activeLessonId={lessonId}
        />
      ) : null}

      {/* ---- Canvas -------------------------------------------------------- */}
      <div className="min-w-0">
        {/* Workspace bar: state + actions. Quiet, one line. */}
        <div className="sticky top-[var(--layout-header)] z-10 -mx-1 mb-6 flex flex-wrap items-center gap-2 rounded-lg border border-border-subtle bg-background-elevated/95 px-3 py-2 shadow-raised backdrop-blur-sm">
          <Badge tone={published ? "positive" : "neutral"}>
            {published
              ? `Published v${published.versionNumber}`
              : "Never published"}
          </Badge>
          <span
            className={cx(
              "text-caption",
              dirty ? "text-warning" : "text-text-muted",
            )}
            role="status"
          >
            {pending ? "Working…" : dirty ? "Unsaved edits" : "Saved"}
          </span>
          {comparison ? (
            <span className="hidden text-caption text-text-muted sm:inline">
              Draft vs v{published?.versionNumber}: +{comparison.added} added, −
              {comparison.removed} removed, {comparison.changed} changed
              {comparison.titleChanged ? ", title changed" : ""}
            </span>
          ) : null}
          <div className="ml-auto flex items-center gap-1.5">
            <Button
              variant="ghost"
              className="px-2.5 text-xs"
              onClick={() => setFocusMode((v) => !v)}
              aria-pressed={focusMode}
              title="Hide panels for distraction-free writing"
            >
              {focusMode ? "Exit focus" : "Focus"}
            </Button>
            <Button
              variant="ghost"
              className="px-2.5 text-xs"
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
              className="px-2.5 text-xs"
              onClick={() => setShowPreview((v) => !v)}
              aria-pressed={showPreview}
            >
              {showPreview ? "Hide preview" : "Preview"}
            </Button>
            <Button
              variant="secondary"
              className="px-2.5 text-xs"
              disabled={pending || !allValid}
              onClick={saveDraft}
              title="Ctrl/⌘ S"
            >
              Save draft
            </Button>
            {canPublish ? (
              <Button
                className="px-3 text-xs"
                disabled={!canPublishNow}
                onClick={() => setPublishOpen(true)}
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

        <div className="empty:hidden">
          <ActionBanner state={result} />
        </div>

        {justPublished !== null ? (
          <div className="nk-scale-in mb-6 mt-4 flex items-center gap-3 rounded-lg border border-success/30 bg-success/8 px-4 py-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-success/15 text-success">
              ✓
            </span>
            <div>
              <p className="text-body-sm font-medium text-text-primary">
                Version {justPublished} is live
              </p>
              <p className="text-caption text-text-secondary">
                Learners now see exactly this lesson — and this version never
                changes.
              </p>
            </div>
          </div>
        ) : null}

        {/* The canvas: content is the interface. */}
        <div
          className={cx(
            "nk-canvas mx-auto w-full",
            focusMode ? "max-w-2xl" : "max-w-3xl",
          )}
        >
          {lessonTitle ? (
            <h1 className="mb-8 text-[1.75rem] font-semibold leading-tight tracking-tight text-text-primary">
              {lessonTitle}
            </h1>
          ) : null}

          <ul className="space-y-1">
            {sorted.map((block, index) => {
              const check = validation[index]!;
              return (
                <li
                  key={block.id}
                  className="group relative rounded-lg px-3 py-2.5 transition-colors duration-[var(--motion-fast)] hover:bg-background-subtle/60 focus-within:bg-background-subtle/60"
                >
                  {/* Block toolbar — appears on intent, never at rest. */}
                  <div className="mb-1.5 flex items-center gap-1 opacity-0 transition-opacity duration-[var(--motion-fast)] focus-within:opacity-100 group-hover:opacity-100">
                    <span className="text-caption font-medium uppercase tracking-[var(--tracking-caps)] text-text-muted">
                      {block.type.replace(/_/g, " ")}
                    </span>
                    {!check.ok ? <Badge tone="danger">invalid</Badge> : null}
                    <span className="ml-auto flex gap-0.5">
                      <Button
                        variant="ghost"
                        className="px-1.5 py-0.5 text-xs"
                        aria-label="Move block up"
                        disabled={index === 0}
                        onClick={() => move(index, -1)}
                      >
                        ↑
                      </Button>
                      <Button
                        variant="ghost"
                        className="px-1.5 py-0.5 text-xs"
                        aria-label="Move block down"
                        disabled={index === sorted.length - 1}
                        onClick={() => move(index, 1)}
                      >
                        ↓
                      </Button>
                      <Button
                        variant="ghost"
                        className="px-1.5 py-0.5 text-xs"
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
                          className="px-1.5 py-0.5 text-xs"
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
                        className="px-1.5 py-0.5 text-xs"
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
                    <p role="alert" className="mt-1 text-caption text-danger">
                      {check.error}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>

          {/* Insertion point — slash-command first, button as the affordance. */}
          <div className="relative mt-2 px-3">
            <button
              type="button"
              onClick={() => setSlashOpen(true)}
              className="nk-press flex w-full items-center gap-2 rounded-lg border border-dashed border-border-default px-3 py-2.5 text-left text-body-sm text-text-muted hover:border-border-strong hover:text-text-secondary"
            >
              <span aria-hidden className="text-text-muted">
                +
              </span>
              Add a block
              <kbd className="ml-auto rounded border border-border-subtle px-1.5 font-mono text-[10px] text-text-muted">
                /
              </kbd>
            </button>
            {slashOpen ? (
              <SlashMenu
                onClose={() => setSlashOpen(false)}
                onInsert={(type) => {
                  insertBlock(type);
                  setSlashOpen(false);
                }}
              />
            ) : null}
          </div>

          {showPreview ? (
            <div className="mt-10 border-t border-border-subtle pt-8">
              <p className="mb-5 text-caption font-medium uppercase tracking-[var(--tracking-caps)] text-text-muted">
                Learner preview — rendered by the same block renderer learners
                see
              </p>
              {allValid ? (
                <BlockList blocks={validBlocks} />
              ) : (
                <Alert tone="warning" title="Preview limited">
                  Invalid blocks are hidden until fixed.
                </Alert>
              )}
            </div>
          ) : null}
        </div>
      </div>

      {/* ---- Inspector ------------------------------------------------------ */}
      {!focusMode ? (
        <Inspector
          health={health}
          workspace={workspace}
          published={published}
          orgSlug={orgSlug}
        />
      ) : null}

      {/* ---- Publish ceremony ----------------------------------------------- */}
      {publishOpen ? (
        <div
          className="fixed inset-0 flex items-start justify-center px-4 pt-[16vh]"
          style={{ zIndex: "var(--z-overlay)" }}
        >
          <button
            type="button"
            aria-label="Cancel publishing"
            onClick={() => setPublishOpen(false)}
            className="nk-backdrop absolute inset-0 bg-[rgb(0_0_0/0.45)] backdrop-blur-[2px]"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Publish lesson"
            className="nk-pop relative w-full max-w-md overflow-hidden rounded-xl border border-border-default bg-background-elevated shadow-overlay"
          >
            <div className="nk-hairline border-b border-border-subtle px-5 py-4">
              <h2 className="text-h3 text-text-primary">
                Publish version {nextVersion}
              </h2>
              <p className="mt-0.5 text-caption text-text-muted">
                Published versions are immutable — learners see exactly this,
                forever.
              </p>
            </div>
            <ul className="space-y-2 px-5 py-4">
              <CeremonyCheck
                ok={allValid && blocks.length > 0}
                label={
                  blocks.length === 0
                    ? "The lesson has no blocks yet"
                    : allValid
                      ? `All ${blocks.length} blocks are valid`
                      : "Some blocks are invalid"
                }
              />
              <CeremonyCheck
                ok={health.score >= Math.ceil(health.total / 2)}
                soft
                label={`Knowledge health: ${health.score} of ${health.total} signals (~${health.readingMinutes} min read)`}
              />
              {comparison ? (
                <CeremonyCheck
                  ok
                  soft
                  label={`Changes since v${published?.versionNumber}: +${comparison.added} / −${comparison.removed} / ~${comparison.changed}`}
                />
              ) : (
                <CeremonyCheck ok soft label="This will be the first version" />
              )}
            </ul>
            <div className="flex items-center justify-end gap-2 border-t border-border-subtle px-5 py-3.5">
              <Button variant="ghost" onClick={() => setPublishOpen(false)}>
                Not yet
              </Button>
              <Button disabled={!canPublishNow} onClick={publishNow}>
                {pending ? "Publishing…" : `Publish v${nextVersion}`}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function CeremonyCheck({
  ok,
  soft = false,
  label,
}: {
  ok: boolean;
  soft?: boolean;
  label: string;
}) {
  return (
    <li className="flex items-start gap-2.5 text-body-sm">
      <span
        aria-hidden
        className={cx(
          "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px]",
          ok
            ? "bg-success/15 text-success"
            : soft
              ? "bg-warning/15 text-warning"
              : "bg-danger-soft text-danger",
        )}
      >
        {ok ? "✓" : "!"}
      </span>
      <span className={ok ? "text-text-secondary" : "text-text-primary"}>
        {label}
      </span>
    </li>
  );
}

/* --------------------------------------------------------------------------
 * Slash menu — keyboard-first block insertion. Opens from "/" or the add
 * affordance; arrows navigate, Enter inserts, Escape dismisses.
 * ------------------------------------------------------------------------ */
function SlashMenu({
  onInsert,
  onClose,
}: {
  onInsert: (type: BlockType) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const matches = ADDABLE_TYPES.filter(
    (t) =>
      t.label.toLowerCase().includes(query.toLowerCase()) ||
      t.type.includes(query.toLowerCase().replace(/\s+/g, "_")),
  );
  const activeEntry = matches[Math.min(active, matches.length - 1)];

  return (
    <div
      role="dialog"
      aria-label="Insert block"
      className="nk-pop absolute inset-x-3 bottom-full z-20 mb-2 overflow-hidden rounded-lg border border-border-default bg-background-elevated shadow-overlay"
    >
      <div className="flex items-center gap-2 border-b border-border-subtle px-3">
        <IconSearch size={14} className="shrink-0 text-text-muted" />
        <input
          ref={inputRef}
          role="combobox"
          aria-expanded="true"
          aria-controls="nk-slash-results"
          aria-activedescendant={
            activeEntry ? `nk-slash-${activeEntry.type}` : undefined
          }
          aria-label="Search block types"
          placeholder="Insert a block…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((i) => Math.min(i + 1, matches.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter" && activeEntry) {
              e.preventDefault();
              onInsert(activeEntry.type);
            } else if (e.key === "Escape") {
              onClose();
            }
          }}
          className="h-10 w-full !border-transparent !bg-transparent text-body-sm text-text-primary outline-none placeholder:text-text-muted"
        />
        <kbd className="rounded border border-border-default px-1.5 py-0.5 font-mono text-caption text-text-muted">
          esc
        </kbd>
      </div>
      <ul
        id="nk-slash-results"
        role="listbox"
        aria-label="Block types"
        className="max-h-64 overflow-y-auto p-1.5"
      >
        {matches.length === 0 ? (
          <li className="px-3 py-4 text-center text-body-sm text-text-muted">
            No block matches “{query}”.
          </li>
        ) : (
          matches.map((entry, index) => (
            <li key={entry.type}>
              <button
                type="button"
                id={`nk-slash-${entry.type}`}
                role="option"
                aria-selected={index === active}
                onMouseEnter={() => setActive(index)}
                onClick={() => onInsert(entry.type)}
                className={cx(
                  "flex w-full items-baseline gap-2.5 rounded-md px-3 py-1.5 text-left transition-colors duration-[var(--motion-fast)]",
                  index === active ? "bg-accent-soft" : "",
                )}
              >
                <span
                  className={cx(
                    "text-body-sm font-medium",
                    index === active ? "text-accent" : "text-text-primary",
                  )}
                >
                  {entry.label}
                </span>
                <span className="truncate text-caption text-text-muted">
                  {entry.hint}
                </span>
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

/* --------------------------------------------------------------------------
 * Knowledge tree — the org's real structure. The open course expands into
 * modules and lessons; journeys and sibling courses are one hop away.
 * ------------------------------------------------------------------------ */
function KnowledgeTree({
  workspace,
  orgSlug,
  activeLessonId,
}: {
  workspace: LessonWorkspaceData;
  orgSlug: string;
  activeLessonId: string;
}) {
  const [filter, setFilter] = useState("");
  const base = `/${orgSlug}/admin`;
  const q = filter.trim().toLowerCase();
  const match = (title: string) => !q || title.toLowerCase().includes(q);
  const current = workspace.tree.currentCourse;

  return (
    <aside
      aria-label="Knowledge structure"
      className="sticky top-[calc(var(--layout-header)+1rem)] hidden max-h-[calc(100dvh-var(--layout-header)-2rem)] flex-col gap-4 overflow-y-auto pr-1 lg:flex"
    >
      <label className="relative block">
        <IconSearch
          size={13}
          className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted"
        />
        <input
          type="search"
          aria-label="Filter the knowledge tree"
          placeholder="Filter…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="w-full rounded-md border border-border-subtle bg-surface py-1.5 pl-8 pr-2 text-body-sm text-text-primary outline-none transition-[border-color,box-shadow] duration-[var(--motion-fast)] placeholder:text-text-muted focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-soft)]"
        />
      </label>

      {current ? (
        <TreeSection icon={<IconCourse size={13} />} label={current.title}>
          {current.modules.map((mod) => (
            <li key={mod.id}>
              <details open>
                <summary className="cursor-pointer list-none rounded px-2 py-1 text-caption font-medium text-text-secondary hover:bg-surface-interactive">
                  {mod.title}
                </summary>
                <ul className="ml-2 border-l border-border-subtle pl-2">
                  {mod.lessons
                    .filter((l) => match(l.title))
                    .map((lesson) => (
                      <li key={lesson.id}>
                        <Link
                          href={`${base}/courses/${current.id}/lessons/${lesson.id}`}
                          aria-current={
                            lesson.id === activeLessonId ? "page" : undefined
                          }
                          className={cx(
                            "flex items-center gap-1.5 truncate rounded px-2 py-1 text-body-sm transition-colors duration-[var(--motion-fast)]",
                            lesson.id === activeLessonId
                              ? "bg-accent-soft font-medium text-accent"
                              : "text-text-secondary hover:bg-surface-interactive hover:text-text-primary",
                          )}
                        >
                          <span className="truncate">{lesson.title}</span>
                          {lesson.status === "published" ? (
                            <span
                              aria-label="published"
                              className="ml-auto h-1 w-1 shrink-0 rounded-full bg-success"
                            />
                          ) : null}
                        </Link>
                      </li>
                    ))}
                </ul>
              </details>
            </li>
          ))}
        </TreeSection>
      ) : null}

      <TreeSection icon={<IconPath size={13} />} label="Journeys">
        {workspace.tree.journeys
          .filter((j) => match(j.title))
          .map((j) => (
            <li key={j.id}>
              <Link
                href={`${base}/studio/paths/${j.id}`}
                className="block truncate rounded px-2 py-1 text-body-sm text-text-secondary transition-colors duration-[var(--motion-fast)] hover:bg-surface-interactive hover:text-text-primary"
              >
                {j.title}
              </Link>
            </li>
          ))}
      </TreeSection>

      <TreeSection icon={<IconCourse size={13} />} label="Courses">
        {workspace.tree.courses
          .filter((c) => match(c.title))
          .map((c) => (
            <li key={c.id}>
              <Link
                href={`${base}/courses/${c.id}`}
                className={cx(
                  "block truncate rounded px-2 py-1 text-body-sm transition-colors duration-[var(--motion-fast)]",
                  c.id === current?.id
                    ? "font-medium text-text-primary"
                    : "text-text-secondary hover:bg-surface-interactive hover:text-text-primary",
                )}
              >
                {c.title}
              </Link>
            </li>
          ))}
      </TreeSection>
    </aside>
  );
}

function TreeSection({
  icon,
  label,
  children,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <details open>
      <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded px-2 py-1 text-caption font-medium uppercase tracking-[var(--tracking-caps)] text-text-muted hover:text-text-secondary">
        <span aria-hidden className="text-text-muted">
          {icon}
        </span>
        {label}
      </summary>
      <ul className="mt-1 space-y-0.5">{children}</ul>
    </details>
  );
}

/* --------------------------------------------------------------------------
 * Inspector — health coaching, real version history, real review activity,
 * and Nova's doorway. Sections collapse naturally via <details>.
 * ------------------------------------------------------------------------ */
function Inspector({
  health,
  workspace,
  published,
  orgSlug,
}: {
  health: ReturnType<typeof assessLessonHealth>;
  workspace?: LessonWorkspaceData;
  published: { versionNumber: number; publishedAt: string } | null;
  orgSlug: string;
}) {
  return (
    <aside
      aria-label="Lesson inspector"
      className="mt-8 flex flex-col gap-3 lg:sticky lg:top-[calc(var(--layout-header)+1rem)] lg:mt-0 lg:max-h-[calc(100dvh-var(--layout-header)-2rem)] lg:overflow-y-auto"
    >
      {/* Knowledge health — coaching, not errors. */}
      <section className="rounded-lg border border-border-subtle bg-surface-elevated p-4 shadow-raised">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-title text-text-primary">Knowledge health</h2>
          <span className="text-body-sm font-semibold tabular-nums text-text-primary">
            {health.score}
            <span className="font-normal text-text-muted">/{health.total}</span>
          </span>
        </div>
        <div
          className="mt-2.5 flex h-1.5 w-full gap-0.5 overflow-hidden rounded-full"
          role="img"
          aria-label={`${health.score} of ${health.total} health signals present`}
        >
          {health.checks.map((c) => (
            <span
              key={c.id}
              className={cx(
                "h-full flex-1",
                c.ok ? "bg-accent" : "bg-border-default",
              )}
            />
          ))}
        </div>
        <p className="mt-2 text-caption text-text-muted">
          {health.words.toLocaleString()} words · ~{health.readingMinutes} min
          read · {health.interactiveCount} interactive
        </p>
        <ul className="mt-3 space-y-1.5">
          {health.checks.map((check) => (
            <li key={check.id} className="flex items-start gap-2">
              <span
                aria-hidden
                className={cx(
                  "mt-1 h-1.5 w-1.5 shrink-0 rounded-full",
                  check.ok ? "bg-success" : "bg-border-strong",
                )}
              />
              <div className="min-w-0">
                <p
                  className={cx(
                    "text-caption",
                    check.ok ? "text-text-secondary" : "text-text-primary",
                  )}
                >
                  {check.label}
                </p>
                {!check.ok ? (
                  <p className="text-caption text-text-muted">{check.coach}</p>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* Nova — the doorway to governed drafting, contextual not intrusive. */}
      <Link
        href={`/${orgSlug}/admin/studio/ai`}
        className="nk-card group flex items-center gap-2.5 rounded-lg border border-border-subtle bg-accent-soft/60 px-3.5 py-3"
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
          <IconAi size={15} />
        </span>
        <span className="min-w-0">
          <span className="block text-body-sm font-medium text-text-primary">
            Draft with Nova
          </span>
          <span className="block text-caption text-text-muted">
            Governed outlines, checks, and rewrites in AI Studio
          </span>
        </span>
      </Link>

      {/* Real version history. */}
      {workspace ? (
        <details
          open={workspace.versions.length > 0}
          className="rounded-lg border border-border-subtle bg-surface p-4"
        >
          <summary className="cursor-pointer list-none text-title text-text-primary">
            Version history
            <span className="ml-2 text-label font-normal tabular-nums text-text-muted">
              {workspace.versions.length}
            </span>
          </summary>
          {workspace.versions.length === 0 ? (
            <p className="mt-2 text-caption text-text-muted">
              Publishing creates version 1 — every version is kept, immutable,
              forever.
            </p>
          ) : (
            <ol className="mt-3 space-y-0">
              {workspace.versions.map((v, i) => (
                <li key={v.id} className="relative flex gap-3 pb-4 last:pb-0">
                  <span className="flex flex-col items-center">
                    <span
                      aria-hidden
                      className={cx(
                        "mt-1 h-2 w-2 shrink-0 rounded-full",
                        i === 0 && published?.versionNumber === v.versionNumber
                          ? "bg-success"
                          : "bg-border-strong",
                      )}
                    />
                    {i < workspace.versions.length - 1 ? (
                      <span
                        aria-hidden
                        className="mt-1 w-px flex-1 bg-border-subtle"
                      />
                    ) : null}
                  </span>
                  <div className="min-w-0 pb-0.5">
                    <p className="text-body-sm text-text-primary">
                      v{v.versionNumber}
                      {i === 0 &&
                      published?.versionNumber === v.versionNumber ? (
                        <span className="ml-1.5 text-caption text-success">
                          live
                        </span>
                      ) : null}
                    </p>
                    <p className="text-caption text-text-muted">
                      {v.blockCount} blocks ·{" "}
                      {new Date(v.publishedAt).toLocaleDateString()}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </details>
      ) : null}

      {/* Real review activity for this lesson. */}
      {workspace ? (
        <details
          open={workspace.reviews.length > 0}
          className="rounded-lg border border-border-subtle bg-surface p-4"
        >
          <summary className="cursor-pointer list-none text-title text-text-primary">
            <span className="inline-flex items-center gap-1.5">
              <IconReview size={13} className="text-text-muted" />
              Review activity
            </span>
            <span className="ml-2 text-label font-normal tabular-nums text-text-muted">
              {workspace.reviews.length}
            </span>
          </summary>
          {workspace.reviews.length === 0 ? (
            <p className="mt-2 text-caption text-text-muted">
              No reviews yet — request one from the workspace bar when the draft
              is ready for another pair of eyes.
            </p>
          ) : (
            <ul className="mt-3 space-y-3">
              {workspace.reviews.map((review) => (
                <li key={review.id} className="space-y-1.5">
                  <p className="flex items-center gap-2 text-caption">
                    <Badge
                      tone={
                        review.status === "approved"
                          ? "positive"
                          : review.status === "changes_requested"
                            ? "warning"
                            : "neutral"
                      }
                    >
                      {review.status.replace(/_/g, " ")}
                    </Badge>
                    <span className="text-text-muted">
                      {new Date(review.createdAt).toLocaleDateString()}
                    </span>
                  </p>
                  {review.comments.map((comment) => (
                    <p
                      key={comment.id}
                      className="rounded-md bg-background-subtle px-2.5 py-1.5 text-caption text-text-secondary"
                    >
                      {comment.body}
                    </p>
                  ))}
                </li>
              ))}
            </ul>
          )}
        </details>
      ) : null}
    </aside>
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
            className="!text-lg !font-semibold"
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
