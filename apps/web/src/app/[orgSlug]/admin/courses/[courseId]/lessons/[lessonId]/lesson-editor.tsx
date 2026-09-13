"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
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
import { ActionBanner, Badge, Button, cx } from "@/components/ui/primitives";
import { Alert } from "@/components/ui/feedback";
import { BlockList } from "@/components/learning/block-renderer";
import {
  BlockFields,
  defaultData,
  SlashMenu,
  type DraftBlock,
} from "./block-palette";
import { CeremonyCheck, Inspector, KnowledgeTree } from "./inspector-panel";

/**
 * Knowledge IDE lesson workspace (experience-design-system.md §knowledge-ide).
 *
 * Three panels: the knowledge tree (structure), the canvas (content becomes
 * the interface — .nk-canvas hides field chrome until intent), and the
 * inspector (health coaching, real version history, real review activity,
 * and the publish ceremony). Split for size (CTO review: god-file drift):
 * block machinery lives in block-palette.tsx, the side panels in
 * inspector-panel.tsx; this file owns editor state, saving, and the
 * publish ceremony. The block model is unchanged: finite validated types,
 * live domain validation, keyboard reordering, one shared renderer for
 * preview. No arbitrary HTML anywhere.
 */

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
