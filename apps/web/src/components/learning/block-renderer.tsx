"use client";

import { useState, type ReactNode } from "react";
import type { ContentBlock } from "@novakore/domain";
import { Alert } from "@/components/ui/feedback";

/**
 * Signed URLs for governed media blocks (image/audio/pdf), resolved
 * server-side per render — asset ids never become public URLs.
 */
export type MediaUrlMap = ReadonlyMap<string, string>;

/**
 * Base path for resolving lesson_reference blocks into in-app links on the
 * current surface — the learner viewer passes
 * `/{org}/learn/{enrollmentId}/courses` (its enrollment covers every course a
 * reference may target); surfaces without one render a reference card.
 * A string, not a resolver function, so server components can pass it.
 */
export type LessonHrefBase = string;

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

export function BlockRenderer({
  block,
  mediaUrls,
  lessonHrefBase,
}: {
  block: ContentBlock;
  mediaUrls?: MediaUrlMap;
  lessonHrefBase?: LessonHrefBase;
}) {
  switch (block.type) {
    case "quote":
      return (
        <blockquote className="border-l-2 border-accent pl-4">
          <p className="text-body-lg italic leading-relaxed text-text-primary">
            {block.data.text}
          </p>
          {block.data.attribution ? (
            <footer className="mt-1.5 text-caption text-text-muted">
              — {block.data.attribution}
            </footer>
          ) : null}
        </blockquote>
      );
    case "accordion":
      return <AccordionBlock items={block.data.items} />;
    case "tabs":
      return <TabsBlock tabs={block.data.tabs} />;
    case "timeline":
      return (
        <ol className="relative space-y-4 border-l border-border-strong pl-5">
          {block.data.events.map((event) => (
            <li key={event.id} className="relative">
              <span
                aria-hidden
                className="absolute -left-[26px] top-1.5 size-2.5 rounded-full bg-accent"
              />
              <p className="text-body font-medium text-text-primary">
                {event.label}
              </p>
              <p className="text-body-sm text-text-secondary">
                {renderInline(event.description)}
              </p>
            </li>
          ))}
        </ol>
      );
    case "comparison":
      return (
        <div className="overflow-x-auto rounded-md border border-border-default">
          <table className="w-full text-body-sm">
            <thead>
              <tr className="border-b border-border-default bg-background-subtle text-left">
                <th className="px-4 py-2 font-medium text-text-primary">
                  {block.data.leftTitle}
                </th>
                <th className="px-4 py-2 font-medium text-text-primary">
                  {block.data.rightTitle}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {block.data.rows.map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-2 text-text-secondary">{row.left}</td>
                  <td className="px-4 py-2 text-text-secondary">{row.right}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "flashcards":
      return <FlashcardsBlock cards={block.data.cards} />;
    case "knowledge_check":
      return (
        <KnowledgeCheckBlock
          prompt={block.data.prompt}
          options={block.data.options}
          correctOptionId={block.data.correctOptionId}
          explanation={block.data.explanation}
        />
      );
    case "reflection":
      return (
        <div className="rounded-md border border-border-default bg-background-subtle p-4">
          <p
            className="text-caption uppercase text-text-muted"
            style={{ letterSpacing: "var(--tracking-caps)" }}
          >
            Reflection
          </p>
          <p className="mt-1 text-body text-text-primary">
            {renderInline(block.data.prompt)}
          </p>
          {block.data.guidance ? (
            <p className="mt-1.5 text-body-sm text-text-secondary">
              {renderInline(block.data.guidance)}
            </p>
          ) : null}
          <p className="mt-2 text-caption text-text-muted">
            Take a moment with this — written responses arrive in a later
            update.
          </p>
        </div>
      );
    case "action_step":
      return (
        <div className="flex items-start gap-3 rounded-md border border-accent/40 bg-accent-soft/40 p-4">
          <span aria-hidden className="mt-0.5 text-accent">
            →
          </span>
          <div className="min-w-0">
            <p className="text-body font-medium text-text-primary">
              {block.data.text}
            </p>
            {block.data.note ? (
              <p className="mt-0.5 text-body-sm text-text-secondary">
                {renderInline(block.data.note)}
              </p>
            ) : null}
          </div>
        </div>
      );
    case "scenario":
      return (
        <section className="space-y-3 rounded-md border border-border-default p-4">
          <p
            className="text-caption uppercase text-text-muted"
            style={{ letterSpacing: "var(--tracking-caps)" }}
          >
            Scenario
          </p>
          <p className="text-body text-text-primary">
            {renderInline(block.data.intro)}
          </p>
          <ol className="space-y-2.5">
            {block.data.steps.map((step, i) => (
              <li key={step.id} className="flex gap-2.5">
                <span className="text-caption tabular-nums text-text-muted">
                  {i + 1}.
                </span>
                <div className="min-w-0">
                  <p className="text-body-sm text-text-primary">
                    {renderInline(step.situation)}
                  </p>
                  {step.consideration ? (
                    <p className="mt-0.5 text-caption text-text-muted">
                      Consider: {step.consideration}
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
          {block.data.debrief ? (
            <p className="border-t border-border-subtle pt-2.5 text-body-sm text-text-secondary">
              {renderInline(block.data.debrief)}
            </p>
          ) : null}
        </section>
      );
    case "audio": {
      const url = mediaUrls?.get(block.data.assetId);
      return (
        <figure className="rounded-md border border-border-default p-4">
          <figcaption className="mb-2 text-body font-medium text-text-primary">
            {block.data.title}
          </figcaption>
          {url ? (
            <audio controls preload="none" src={url} className="w-full">
              <track kind="captions" />
            </audio>
          ) : (
            <p className="text-body-sm text-text-muted">
              Audio: {block.data.title} (unavailable right now)
            </p>
          )}
          {block.data.transcriptNote ? (
            <p className="mt-1.5 text-caption text-text-muted">
              {block.data.transcriptNote}
            </p>
          ) : null}
        </figure>
      );
    }
    case "pdf": {
      const url = mediaUrls?.get(block.data.assetId);
      return (
        <a
          href={url ?? "#"}
          target="_blank"
          rel="noreferrer noopener"
          aria-disabled={url === undefined}
          className="flex items-center gap-3 rounded-md border border-border-default p-4 transition-colors hover:border-border-strong"
        >
          <span
            aria-hidden
            className="rounded bg-background-subtle px-2 py-1 font-mono text-caption text-text-muted"
          >
            PDF
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-body font-medium text-text-primary">
              {block.data.title}
            </span>
            <span className="text-caption text-text-muted">
              {block.data.pageCount ? `${block.data.pageCount} pages · ` : ""}
              Download
            </span>
          </span>
        </a>
      );
    }
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
    case "image": {
      const url = mediaUrls?.get(block.data.assetId);
      return (
        <figure className="overflow-hidden rounded-md border border-border-default">
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element -- signed, short-lived URL
            <img
              src={url}
              alt={block.data.decorative ? "" : (block.data.alt ?? "")}
              className="max-w-full"
              loading="lazy"
            />
          ) : (
            <p className="bg-background-subtle p-4 text-body-sm text-text-secondary">
              Image{block.data.decorative ? "" : `: ${block.data.alt}`}
            </p>
          )}
          {block.data.caption ? (
            <figcaption className="px-4 py-2 text-caption text-text-muted">
              {block.data.caption}
            </figcaption>
          ) : null}
        </figure>
      );
    }
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
    case "lesson_reference": {
      const href = lessonHrefBase
        ? `${lessonHrefBase}/${block.data.courseId}/lessons/${block.data.lessonId}`
        : null;
      const body = (
        <>
          <p
            className="text-caption uppercase text-text-muted"
            style={{ letterSpacing: "var(--tracking-caps)" }}
          >
            Recall
          </p>
          <p className="mt-1 text-body font-medium text-text-primary">
            {block.data.label}
          </p>
          {block.data.note ? (
            <p className="mt-0.5 text-caption text-text-muted">
              {block.data.note}
            </p>
          ) : null}
        </>
      );
      return href ? (
        <a
          href={href}
          className="block rounded-md border border-border-default bg-surface p-4 transition-colors hover:border-border-strong"
        >
          {body}
        </a>
      ) : (
        <div className="rounded-md border border-dashed border-border-default bg-background-subtle p-4">
          {body}
        </div>
      );
    }
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

export function BlockList({
  blocks,
  mediaUrls,
  lessonHrefBase,
}: {
  blocks: ContentBlock[];
  mediaUrls?: MediaUrlMap;
  lessonHrefBase?: LessonHrefBase;
}) {
  const ordered = [...blocks].sort((a, b) =>
    a.position < b.position ? -1 : a.position > b.position ? 1 : 0,
  );
  return (
    <div className="space-y-5">
      {ordered.map((block) => (
        <BlockRenderer
          key={block.id}
          block={block}
          mediaUrls={mediaUrls}
          lessonHrefBase={lessonHrefBase}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Interactive block internals (keyboard accessible, no external state)
// ---------------------------------------------------------------------------

function AccordionBlock({
  items,
}: {
  items: { id: string; title: string; body: string }[];
}) {
  return (
    <div className="divide-y divide-border-subtle rounded-md border border-border-default">
      {items.map((item) => (
        <details key={item.id} className="group px-4 py-3">
          <summary className="cursor-pointer list-none text-body font-medium text-text-primary marker:hidden">
            <span
              aria-hidden
              className="mr-2 inline-block transition-transform group-open:rotate-90"
            >
              ›
            </span>
            {item.title}
          </summary>
          <p className="mt-2 pl-5 text-body-sm text-text-secondary">
            {renderInline(item.body)}
          </p>
        </details>
      ))}
    </div>
  );
}

function TabsBlock({
  tabs,
}: {
  tabs: { id: string; title: string; body: string }[];
}) {
  const [active, setActive] = useState(tabs[0]?.id);
  const current = tabs.find((t) => t.id === active) ?? tabs[0];
  return (
    <div className="rounded-md border border-border-default">
      <div
        role="tablist"
        className="flex flex-wrap gap-1 border-b border-border-subtle px-2 pt-2"
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={tab.id === current?.id}
            onClick={() => setActive(tab.id)}
            className={`rounded-t-md px-3 py-1.5 text-body-sm transition-colors ${
              tab.id === current?.id
                ? "bg-accent-soft font-medium text-accent"
                : "text-text-muted hover:text-text-primary"
            }`}
          >
            {tab.title}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        className="px-4 py-3 text-body-sm text-text-secondary"
      >
        {current ? renderInline(current.body) : null}
      </div>
    </div>
  );
}

function FlashcardsBlock({
  cards,
}: {
  cards: { id: string; front: string; back: string }[];
}) {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const card = cards[Math.min(index, cards.length - 1)]!;
  return (
    <div className="space-y-2">
      <button
        onClick={() => setFlipped((f) => !f)}
        aria-label={flipped ? "Show front of card" : "Reveal back of card"}
        className="flex min-h-36 w-full items-center justify-center rounded-md border border-border-default bg-surface p-6 text-center transition-colors hover:border-accent"
      >
        <span className="text-body-lg text-text-primary">
          {flipped ? card.back : card.front}
        </span>
      </button>
      <div className="flex items-center justify-between text-body-sm">
        <button
          className="text-text-muted hover:text-text-primary disabled:opacity-40"
          disabled={index === 0}
          onClick={() => {
            setIndex((i) => i - 1);
            setFlipped(false);
          }}
        >
          ← Previous
        </button>
        <span className="text-caption tabular-nums text-text-muted">
          {index + 1} / {cards.length}
        </span>
        <button
          className="text-text-muted hover:text-text-primary disabled:opacity-40"
          disabled={index >= cards.length - 1}
          onClick={() => {
            setIndex((i) => i + 1);
            setFlipped(false);
          }}
        >
          Next →
        </button>
      </div>
    </div>
  );
}

/**
 * Ungraded formative self-check (documented): the correct option is part
 * of the frozen snapshot by design — reveal-on-answer, no score, no
 * progress effect. Graded checks use assessment_reference.
 */
function KnowledgeCheckBlock({
  prompt,
  options,
  correctOptionId,
  explanation,
}: {
  prompt: string;
  options: { id: string; text: string }[];
  correctOptionId: string;
  explanation?: string;
}) {
  const [chosen, setChosen] = useState<string | null>(null);
  return (
    <div className="space-y-2.5 rounded-md border border-border-default p-4">
      <p
        className="text-caption uppercase text-text-muted"
        style={{ letterSpacing: "var(--tracking-caps)" }}
      >
        Check yourself
      </p>
      <p className="text-body font-medium text-text-primary">
        {renderInline(prompt)}
      </p>
      <ul className="space-y-1.5">
        {options.map((option) => {
          const revealed = chosen !== null;
          const isCorrect = option.id === correctOptionId;
          const isChosen = option.id === chosen;
          return (
            <li key={option.id}>
              <button
                disabled={revealed}
                onClick={() => setChosen(option.id)}
                className={`w-full rounded-md border px-3 py-2 text-left text-body-sm transition-colors ${
                  revealed && isCorrect
                    ? "border-success bg-success-soft text-text-primary"
                    : revealed && isChosen
                      ? "border-danger bg-danger-soft text-text-primary"
                      : "border-border-default text-text-primary hover:border-accent"
                }`}
              >
                {option.text}
                {revealed && isCorrect ? " ✓" : ""}
              </button>
            </li>
          );
        })}
      </ul>
      {chosen !== null ? (
        <p role="status" className="text-body-sm text-text-secondary">
          {chosen === correctOptionId ? "Correct. " : "Not quite. "}
          {explanation ? renderInline(explanation) : null}
        </p>
      ) : null}
    </div>
  );
}
