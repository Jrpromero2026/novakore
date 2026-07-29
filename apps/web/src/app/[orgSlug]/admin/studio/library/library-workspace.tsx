"use client";

import { useMemo, useState, useTransition } from "react";
import { BLOCK_STATUS } from "@novakore/domain";
import {
  archiveLibraryBlockAction,
  applyLibraryBlockAction,
} from "@/lib/actions/studio";
import { idle, type ActionState } from "@/lib/actions/types";
import type { LibraryData } from "@/lib/data/studio";
import { BlockRenderer } from "@/components/learning/block-renderer";
import {
  ActionBanner,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Input,
  Select,
} from "@/components/ui/primitives";
import type { ContentBlock } from "@novakore/domain";

export function LibraryWorkspace({
  orgSlug,
  data,
  canManage,
  canAuthor,
}: {
  orgSlug: string;
  data: LibraryData;
  canManage: boolean;
  canAuthor: boolean;
}) {
  const [feedback, setFeedback] = useState<ActionState>(idle);
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState("");
  const [targetLesson, setTargetLesson] = useState<Record<string, string>>({});

  const run = (fn: () => Promise<ActionState>) =>
    startTransition(async () => setFeedback(await fn()));

  const tags = useMemo(
    () => [...new Set(data.blocks.flatMap((b) => b.tags))].sort(),
    [data.blocks],
  );
  const visible = data.blocks.filter((b) => {
    if (b.status === "archived") return false;
    if (tag && !b.tags.includes(tag)) return false;
    if (query && !b.title.toLowerCase().includes(query.toLowerCase()))
      return false;
    return true;
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Reusable content library"
          description="Save any block once, reuse it everywhere. Linked copies pick up shared updates on their next publish; local copies are independent."
        />
        <div className="flex flex-wrap items-end gap-3 px-5 py-4">
          <div className="min-w-48 flex-1">
            <label
              htmlFor="lib-search"
              className="mb-1 block text-caption text-text-muted"
            >
              Search
            </label>
            <Input
              id="lib-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by title…"
            />
          </div>
          <div className="min-w-40">
            <label
              htmlFor="lib-tag"
              className="mb-1 block text-caption text-text-muted"
            >
              Tag
            </label>
            <Select
              id="lib-tag"
              value={tag}
              onChange={(e) => setTag(e.target.value)}
            >
              <option value="">All tags</option>
              {tags.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div className="px-5 pb-3 empty:hidden">
          <ActionBanner state={feedback} />
        </div>
      </Card>

      {visible.length === 0 ? (
        <Card>
          <EmptyState
            title="No reusable blocks yet"
            description="In the lesson editor, save a block to the library to reuse it across lessons."
          />
        </Card>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {visible.map((block) => {
            const preview = {
              id: block.id,
              type: block.blockType,
              schemaVersion: block.schemaVersion,
              position: "a0",
              data: block.data,
            } as unknown as ContentBlock;
            return (
              <li key={block.id}>
                <Card>
                  <div className="flex flex-wrap items-center gap-2 px-5 pt-4">
                    <span className="min-w-0 flex-1 truncate text-body font-medium text-text-primary">
                      {block.title}
                    </span>
                    <Badge tone="neutral">
                      {block.blockType.replace(/_/g, " ")}
                    </Badge>
                    <Badge tone="neutral">v{block.version}</Badge>
                    {block.usageCount > 0 ? (
                      <Badge tone="accent">used {block.usageCount}×</Badge>
                    ) : null}
                  </div>
                  {block.description ? (
                    <p className="px-5 pt-1 text-caption text-text-muted">
                      {block.description}
                    </p>
                  ) : null}
                  <div className="max-h-56 overflow-hidden px-5 py-3">
                    {BLOCK_STATUS[block.blockType] === "schema_only" ? (
                      <p className="text-body-sm text-text-muted">
                        {block.blockType.replace(/_/g, " ")} block (preview
                        arrives with its editor)
                      </p>
                    ) : (
                      <BlockRenderer block={preview} />
                    )}
                  </div>
                  {block.tags.length > 0 ? (
                    <div className="flex flex-wrap gap-1 px-5 pb-2">
                      {block.tags.map((t) => (
                        <span
                          key={t}
                          className="rounded bg-background-subtle px-2 py-0.5 text-caption text-text-muted"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {canAuthor ? (
                    <div className="flex flex-wrap items-end gap-2 border-t border-border-subtle px-5 py-3">
                      <div className="min-w-40 flex-1">
                        <label htmlFor={`use-${block.id}`} className="sr-only">
                          Choose lesson
                        </label>
                        <Select
                          id={`use-${block.id}`}
                          value={targetLesson[block.id] ?? ""}
                          onChange={(e) =>
                            setTargetLesson((s) => ({
                              ...s,
                              [block.id]: e.target.value,
                            }))
                          }
                        >
                          <option value="">Choose lesson…</option>
                          {data.lessons.map((l) => (
                            <option key={l.id} value={l.id}>
                              {l.courseTitle} · {l.title}
                            </option>
                          ))}
                        </Select>
                      </div>
                      <Button
                        variant="secondary"
                        className="text-xs"
                        disabled={pending || !targetLesson[block.id]}
                        onClick={() =>
                          run(() =>
                            applyLibraryBlockAction(
                              orgSlug,
                              block.id,
                              targetLesson[block.id]!,
                              "link",
                            ),
                          )
                        }
                      >
                        Link
                      </Button>
                      <Button
                        variant="ghost"
                        className="text-xs"
                        disabled={pending || !targetLesson[block.id]}
                        onClick={() =>
                          run(() =>
                            applyLibraryBlockAction(
                              orgSlug,
                              block.id,
                              targetLesson[block.id]!,
                              "copy",
                            ),
                          )
                        }
                      >
                        Copy
                      </Button>
                      {canManage ? (
                        <Button
                          variant="ghost"
                          className="text-xs text-danger"
                          disabled={pending}
                          onClick={() =>
                            run(() =>
                              archiveLibraryBlockAction(orgSlug, block.id),
                            )
                          }
                        >
                          Archive
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
