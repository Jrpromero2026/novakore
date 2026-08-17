"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { TermKey } from "@novakore/domain";
import { cx } from "@/components/ui/primitives";
import { tourTarget, TOUR_TARGETS } from "@/lib/onboarding/targets";
import { useWalkthrough } from "./walkthrough";

/**
 * Help & Learn menu — the persistent entry point for guidance
 * (docs/architecture/onboarding.md). Lists only walkthroughs the member is
 * permitted to run; replaying one never resets checklist completion or
 * touches organization data. Follows the workspace menu-button pattern
 * (Escape closes, outside click closes, focus returns to trigger).
 */

const GLOSSARY: { key: string; termKey: TermKey; description: string }[] = [
  {
    key: "journey",
    termKey: "learning_path",
    description:
      "The complete learning experience. It can contain multiple sections of content and is what learners enroll into.",
  },
  {
    key: "course",
    termKey: "course",
    description:
      "A major, versioned section of learning. Learners always see exactly the version you published.",
  },
  {
    key: "module",
    termKey: "module",
    description: "Organizes a section into a sequence or milestone.",
  },
  {
    key: "lesson",
    termKey: "lesson",
    description:
      "The actual learning experience — video, reading, activities, assessments, reflection, and resources.",
  },
  {
    key: "assessment",
    termKey: "assessment",
    description: "A governed evaluation of what a learner has mastered.",
  },
  {
    key: "credential",
    termKey: "credential",
    description: "Verifiable recognition issued when learning is complete.",
  },
  {
    key: "enrollment",
    termKey: "enrollment",
    description:
      "Connects a learner to content and carries their progress. Publishing stays private until a learner is enrolled.",
  },
];

export function HelpMenu({ orgSlug }: { orgSlug: string }) {
  const { available, start, term } = useWalkthrough();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"walkthroughs" | "glossary">("walkthroughs");
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Help and learning menu"
        onClick={() => setOpen((prev) => !prev)}
        {...tourTarget(TOUR_TARGETS.helpMenu)}
        className={cx(
          "nk-press flex h-7 w-7 items-center justify-center rounded-full border text-caption font-semibold",
          open
            ? "border-accent bg-accent-soft text-accent"
            : "border-border-default text-text-secondary hover:border-border-strong hover:text-text-primary",
        )}
      >
        ?
      </button>

      {open ? (
        <div
          role="menu"
          aria-label="Help and learning"
          className="nk-pop absolute right-0 top-[calc(100%+0.5rem)] w-80 origin-top-right overflow-hidden rounded-lg border border-border-default bg-background-elevated shadow-overlay"
          style={{ zIndex: "var(--z-panel)" }}
        >
          <div className="border-b border-border-subtle p-1">
            <Link
              role="menuitem"
              href={`/${orgSlug}/admin`}
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-body-sm font-medium text-accent transition-colors duration-[var(--motion-fast)] hover:bg-accent-soft"
            >
              Academy Launch checklist
            </Link>
          </div>

          <div
            role="tablist"
            aria-label="Help sections"
            className="flex gap-1 border-b border-border-subtle px-2 pt-2"
          >
            {(
              [
                ["walkthroughs", "Walkthroughs"],
                ["glossary", "Glossary"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                role="tab"
                aria-selected={tab === key}
                onClick={() => setTab(key)}
                className={cx(
                  "rounded-t-md px-2.5 py-1.5 text-caption font-medium transition-colors duration-[var(--motion-fast)]",
                  tab === key
                    ? "border-b-2 border-accent text-accent"
                    : "text-text-muted hover:text-text-secondary",
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === "walkthroughs" ? (
            <div className="max-h-80 overflow-y-auto p-1">
              {available.length === 0 ? (
                <p className="px-2.5 py-3 text-body-sm text-text-muted">
                  No walkthroughs are available for your role.
                </p>
              ) : (
                available.map((w) => (
                  <button
                    key={w.id}
                    role="menuitem"
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      start(w.id);
                    }}
                    className="block w-full rounded-md px-2.5 py-2 text-left transition-colors duration-[var(--motion-fast)] hover:bg-surface-interactive"
                  >
                    <span className="block text-body-sm font-medium text-text-primary">
                      {w.title(term)}
                    </span>
                    <span className="mt-0.5 block text-caption leading-snug text-text-muted">
                      {w.description(term)}
                    </span>
                  </button>
                ))
              )}
            </div>
          ) : (
            <dl className="max-h-80 overflow-y-auto px-3.5 py-2.5">
              {GLOSSARY.map((entry) => (
                <div key={entry.key} className="py-1.5">
                  <dt className="text-body-sm font-medium text-text-primary">
                    {term(entry.termKey).singular}
                  </dt>
                  <dd className="mt-0.5 text-caption leading-relaxed text-text-muted">
                    {entry.description}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      ) : null}
    </div>
  );
}
