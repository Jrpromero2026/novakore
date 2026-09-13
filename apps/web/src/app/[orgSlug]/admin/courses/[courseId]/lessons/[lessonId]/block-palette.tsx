"use client";

import { useEffect, useRef, useState } from "react";
import type { BlockType } from "@novakore/domain";
import {
  Button,
  Input,
  Select,
  Textarea,
  cx,
} from "@/components/ui/primitives";
import { IconSearch } from "@/components/ui/icons";

/**
 * Block machinery for the Knowledge IDE, split out of lesson-editor.tsx
 * (CTO review: god-file drift). Everything about WHAT a block is and how
 * one is authored lives here: the addable catalog, per-type default data,
 * the slash-menu inserter, and the per-type field editors. The editor
 * itself (state, saving, publishing, panels) stays in lesson-editor.tsx.
 */
export type DraftBlock = {
  id: string;
  type: BlockType;
  schemaVersion: number;
  data: Record<string, unknown>;
  position: string;
};

export const ADDABLE_TYPES: { type: BlockType; label: string; hint: string }[] =
  [
    {
      type: "rich_text",
      label: "Text",
      hint: "Paragraphs with **bold** links",
    },
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
    {
      type: "file_link",
      label: "Resource link",
      hint: "Downloadable reference",
    },
    { type: "divider", label: "Divider", hint: "Visual break" },
  ];

export const uid = () => crypto.randomUUID();

export function defaultData(type: BlockType): Record<string, unknown> {
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

/* --------------------------------------------------------------------------
 * Slash menu — keyboard-first block insertion. Opens from "/" or the add
 * affordance; arrows navigate, Enter inserts, Escape dismisses.
 * ------------------------------------------------------------------------ */
export function SlashMenu({
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

export function BlockFields({
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
