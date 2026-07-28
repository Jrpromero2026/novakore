import type { ReactNode } from "react";
import type { ContentBlock } from "@novakore/domain";
import { Alert } from "@/components/ui/feedback";

/**
 * THE block renderer — used by the learner viewer, the admin lesson preview,
 * and published-version inspection. Escape-first by construction: all text
 * flows through React text nodes; the minimal inline subset (**bold**,
 * *italic*, [label](https://…)) is parsed from the escaped string into
 * elements. No dangerouslySetInnerHTML anywhere. Unknown or invalid blocks
 * degrade to a neutral notice instead of crashing.
 */

const INLINE_PATTERN =
  /(\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\(https:\/\/[^\s)]+\))/g;

/** Parse the safe inline subset from plain text (already React-escaped). */
export function renderInline(text: string): ReactNode[] {
  const parts = text.split(INLINE_PATTERN);
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      return <em key={index}>{part.slice(1, -1)}</em>;
    }
    const link = /^\[([^\]]+)\]\((https:\/\/[^\s)]+)\)$/.exec(part);
    if (link) {
      return (
        <a
          key={index}
          href={link[2]}
          target="_blank"
          rel="noreferrer noopener"
          className="text-accent underline underline-offset-2 hover:text-accent-hover"
        >
          {link[1]}
        </a>
      );
    }
    return part;
  });
}

function Paragraphs({ text }: { text: string }) {
  return (
    <>
      {text
        .split(/\n{2,}/)
        .filter((p) => p.trim().length > 0)
        .map((paragraph, i) => (
          <p key={i} className="text-body leading-relaxed text-text-primary">
            {renderInline(paragraph)}
          </p>
        ))}
    </>
  );
}

export function BlockRenderer({ block }: { block: ContentBlock }) {
  switch (block.type) {
    case "rich_text":
      return (
        <div className="space-y-3">
          <Paragraphs text={block.data.text} />
        </div>
      );
    case "heading": {
      const Tag = block.data.level === 2 ? "h2" : "h3";
      return (
        <Tag
          className={
            block.data.level === 2
              ? "text-h2 text-text-primary"
              : "text-h3 text-text-primary"
          }
        >
          {block.data.text}
        </Tag>
      );
    }
    case "callout":
      return (
        <Alert
          tone={block.data.tone === "note" ? "info" : block.data.tone}
          title={block.data.title}
        >
          {renderInline(block.data.body)}
        </Alert>
      );
    case "divider":
      return <hr className="border-border-default" />;
    case "image":
      // Signed-URL resolution arrives with content-image delivery; branding
      // assets render through the media pipeline. Placeholder keeps alt.
      return (
        <figure className="rounded-md border border-border-default bg-background-subtle p-4">
          <p className="text-body-sm text-text-secondary">
            Image{block.data.decorative ? "" : `: ${block.data.alt}`}
          </p>
          {block.data.caption ? (
            <figcaption className="mt-1 text-caption text-text-muted">
              {block.data.caption}
            </figcaption>
          ) : null}
        </figure>
      );
    case "video":
      // External-resource card (no arbitrary iframes — documented policy).
      return (
        <a
          href={block.data.url}
          target="_blank"
          rel="noreferrer noopener"
          className="block rounded-md border border-border-default bg-surface p-4 transition-colors hover:border-border-strong"
        >
          <p
            className="text-caption uppercase text-text-muted"
            style={{ letterSpacing: "var(--tracking-caps)" }}
          >
            Video
            {block.data.durationMinutes
              ? ` · ${block.data.durationMinutes} min`
              : ""}
          </p>
          <p className="mt-1 text-body font-medium text-text-primary">
            {block.data.title}
          </p>
          {block.data.transcriptNote ? (
            <p className="mt-1 text-caption text-text-muted">
              {block.data.transcriptNote}
            </p>
          ) : null}
        </a>
      );
    case "file_link":
      return (
        <a
          href={block.data.url ?? "#"}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-2 rounded-md border border-border-strong px-3 py-2 text-body-sm font-medium text-text-primary hover:bg-surface-interactive"
        >
          {block.data.label}
        </a>
      );
    case "checklist":
      return (
        <ul className="space-y-1.5">
          {block.data.items.map((item) => (
            <li
              key={item.id}
              className="flex items-start gap-2 text-body text-text-primary"
            >
              <span
                aria-hidden
                className="mt-1 size-3.5 shrink-0 rounded-sm border border-border-strong"
              />
              {item.text}
            </li>
          ))}
        </ul>
      );
    case "assessment_reference":
      return (
        <div className="rounded-md border border-dashed border-border-strong bg-background-subtle p-4">
          <p
            className="text-caption uppercase text-text-muted"
            style={{ letterSpacing: "var(--tracking-caps)" }}
          >
            Assessment
          </p>
          <p className="mt-1 text-body font-medium text-text-primary">
            {block.data.title}
          </p>
          <p className="mt-0.5 text-caption text-text-muted">
            Assessments open in a later platform phase.
          </p>
        </div>
      );
    default:
      return (
        <div
          role="note"
          className="rounded-md border border-border-default bg-background-subtle px-3 py-2 text-body-sm text-text-muted"
        >
          This content type isn&apos;t supported yet.
        </div>
      );
  }
}

export function BlockList({ blocks }: { blocks: ContentBlock[] }) {
  const ordered = [...blocks].sort((a, b) =>
    a.position < b.position ? -1 : a.position > b.position ? 1 : 0,
  );
  return (
    <div className="space-y-5">
      {ordered.map((block) => (
        <BlockRenderer key={block.id} block={block} />
      ))}
    </div>
  );
}
