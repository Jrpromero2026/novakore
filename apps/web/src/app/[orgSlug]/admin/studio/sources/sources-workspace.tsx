"use client";

import Link from "next/link";
import { useActionState, useMemo, useState, useTransition } from "react";
import type { SourceWorkspaceItem } from "@/lib/data/studio";
import {
  approveSourceDocumentAction,
  archiveSourceDocumentAction,
  createSourceDocumentAction,
  uploadSourceFileAction,
} from "@/lib/actions/studio";
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

const ACCEPT = ".pdf,.docx,.txt,.md,.csv,.png,.jpg,.jpeg,.webp,.mp4,.webm,.mov";

function kindOf(item: SourceWorkspaceItem): {
  label: string;
  tone: "neutral" | "positive" | "warning" | "danger";
} {
  const mime = item.mimeType ?? "";
  if (item.kind !== "file") return { label: item.kind, tone: "neutral" };
  if (mime.startsWith("image/")) return { label: "image", tone: "neutral" };
  if (mime.startsWith("video/")) return { label: "video", tone: "neutral" };
  if (mime === "text/csv") return { label: "data", tone: "neutral" };
  return { label: "document", tone: "neutral" };
}

function extractionBadge(item: SourceWorkspaceItem): {
  label: string;
  tone: "neutral" | "positive" | "warning" | "danger";
} | null {
  if (item.kind !== "file") return null;
  switch (item.extractionStatus) {
    case "extracted":
      return {
        label: `${(item.extractedChars ?? 0).toLocaleString()} chars extracted`,
        tone: "positive",
      };
    case "failed":
      return { label: "no text extracted", tone: "warning" };
    default:
      return null;
  }
}

function formatBytes(size: number | null): string {
  if (size === null) return "";
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / 1_048_576).toFixed(1)} MB`;
}

export function SourcesWorkspace({
  orgSlug,
  sources,
}: {
  orgSlug: string;
  sources: SourceWorkspaceItem[];
}) {
  const [filter, setFilter] = useState("");
  const [uploadState, uploadAction, uploadPending] = useActionState(
    uploadSourceFileAction.bind(null, orgSlug),
    idle,
  );
  const [textState, textAction, textPending] = useActionState(
    createSourceDocumentAction.bind(null, orgSlug),
    idle,
  );

  const q = filter.trim().toLowerCase();
  const visible = useMemo(
    () =>
      q === ""
        ? sources
        : sources.filter(
            (s) =>
              s.title.toLowerCase().includes(q) ||
              (s.originalFilename ?? "").toLowerCase().includes(q) ||
              (s.contentPreview ?? "").toLowerCase().includes(q),
          ),
    [sources, q],
  );

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
      <div className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <label className="relative block max-w-xs flex-1">
            <span className="sr-only">Search sources</span>
            <Input
              type="search"
              placeholder="Search sources…"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
            />
          </label>
          <span className="text-caption tabular-nums text-text-muted">
            {visible.length} of {sources.length}
          </span>
        </div>

        {sources.length === 0 ? (
          <EmptyState
            title="Nothing here yet"
            description="Upload a document, image, or video — or paste text — and build from it."
          />
        ) : (
          <ul className="space-y-2">
            {visible.map((item) => (
              <SourceRow key={item.id} orgSlug={orgSlug} item={item} />
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-5">
        <Card>
          <CardHeader
            title="Upload a file"
            description="PDF, DOCX, TXT, MD, CSV, images, video. Documents get real text extraction; media is stored and browsable."
          />
          <form action={uploadAction} className="space-y-3 px-5 pb-5">
            <Field label="File" htmlFor="source-file">
              <Input
                id="source-file"
                name="file"
                type="file"
                accept={ACCEPT}
                required
              />
            </Field>
            <Field
              label="Title"
              htmlFor="source-title"
              hint="Defaults to the file name."
            >
              <Input id="source-title" name="title" maxLength={200} />
            </Field>
            <Field label="Provenance" htmlFor="source-provenance">
              <Input
                id="source-provenance"
                name="provenance"
                maxLength={500}
                placeholder="Where this came from"
              />
            </Field>
            <Button type="submit" disabled={uploadPending}>
              {uploadPending ? "Uploading…" : "Upload"}
            </Button>
            <div className="empty:hidden">
              <ActionBanner state={uploadState} />
            </div>
          </form>
        </Card>

        <Card>
          <CardHeader
            title="Paste text"
            description="Inline text or markdown, up to 100k characters."
          />
          <form action={textAction} className="space-y-3 px-5 pb-5">
            <Field label="Title" htmlFor="text-title">
              <Input id="text-title" name="title" required maxLength={200} />
            </Field>
            <Field label="Format" htmlFor="text-kind">
              <Select id="text-kind" name="kind" defaultValue="text">
                <option value="text">Plain text</option>
                <option value="markdown">Markdown</option>
              </Select>
            </Field>
            <Field label="Content" htmlFor="text-content">
              <Textarea id="text-content" name="content" rows={6} required />
            </Field>
            <Button type="submit" variant="secondary" disabled={textPending}>
              {textPending ? "Saving…" : "Add source"}
            </Button>
            <div className="empty:hidden">
              <ActionBanner state={textState} />
            </div>
          </form>
        </Card>

        <p className="text-caption text-text-muted">
          Extracted sources appear in the{" "}
          <Link
            href={`/${orgSlug}/admin/studio/ai`}
            className="text-accent hover:text-accent-hover"
          >
            AI workspace
          </Link>{" "}
          as grounding — the model only ever sees sources you attach.
        </p>
      </div>
    </div>
  );
}

function SourceRow({
  orgSlug,
  item,
}: {
  orgSlug: string;
  item: SourceWorkspaceItem;
}) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<ActionState>(idle);
  const [pending, startTransition] = useTransition();
  const kind = kindOf(item);
  const extraction = extractionBadge(item);

  return (
    <li className="rounded-md border border-border-subtle bg-surface">
      <div className="flex flex-wrap items-center gap-2 px-4 py-3">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="min-w-0 flex-1 text-left"
        >
          <span className="block truncate text-body-sm font-medium text-text-primary">
            {item.title}
          </span>
          <span className="block truncate text-caption text-text-muted">
            {[
              item.originalFilename,
              formatBytes(item.byteSize),
              new Date(item.createdAt).toLocaleDateString(),
              item.provenance,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </button>
        <Badge tone={kind.tone}>{kind.label}</Badge>
        {extraction ? (
          <Badge tone={extraction.tone}>{extraction.label}</Badge>
        ) : null}
        {item.reviewState === "approved" ? (
          <Badge tone="positive">approved</Badge>
        ) : null}
      </div>
      {open ? (
        <div className="space-y-3 border-t border-border-subtle px-4 py-3">
          {item.extractionNote ? (
            <p className="text-caption text-text-muted">
              {item.extractionNote}
            </p>
          ) : null}
          {item.contentPreview ? (
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded bg-background-subtle p-3 text-caption text-text-secondary">
              {item.contentPreview}
              {item.hasContent &&
              (item.extractedChars ?? 0) > item.contentPreview.length
                ? "…"
                : ""}
            </pre>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            {item.downloadUrl ? (
              <a
                href={item.downloadUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="rounded-md border border-border-strong px-3 py-1.5 text-body-sm font-medium text-text-primary hover:bg-surface-interactive"
              >
                Open file
              </a>
            ) : null}
            {item.reviewState !== "approved" ? (
              <Button
                variant="secondary"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    setState(
                      await approveSourceDocumentAction(orgSlug, item.id),
                    );
                  })
                }
              >
                Approve
              </Button>
            ) : null}
            <Button
              variant="ghost"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  setState(await archiveSourceDocumentAction(orgSlug, item.id));
                })
              }
            >
              Archive
            </Button>
          </div>
          <div className="empty:hidden">
            <ActionBanner state={state} />
          </div>
        </div>
      ) : null}
    </li>
  );
}
