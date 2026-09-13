"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Badge, cx } from "@/components/ui/primitives";
import {
  IconAi,
  IconCourse,
  IconPath,
  IconReview,
  IconSearch,
} from "@/components/ui/icons";
import type { LessonWorkspaceData } from "@/lib/data/studio";
import { assessLessonHealth } from "@/lib/lesson-health";

/**
 * The Knowledge IDE's side panels, split out of lesson-editor.tsx (CTO
 * review: god-file drift): the knowledge tree (structure), the inspector
 * (health coaching, version history, review activity), and the publish
 * ceremony's check row. Pure presentation — every number they show is
 * handed in from the editor's real data.
 */
export function CeremonyCheck({
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
 * Knowledge tree — the org's real structure. The open course expands into
 * modules and lessons; journeys and sibling courses are one hop away.
 * ------------------------------------------------------------------------ */
export function KnowledgeTree({
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
export function Inspector({
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
