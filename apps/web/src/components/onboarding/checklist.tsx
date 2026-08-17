"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import type { ChecklistView } from "@/lib/onboarding/steps";
import {
  celebrateChecklistAction,
  dismissChecklistAction,
  recordOnboardingEventAction,
  restoreChecklistAction,
} from "@/lib/actions/onboarding";
import { StartWalkthroughButton } from "./walkthrough";
import { tourTarget, TOUR_TARGETS } from "@/lib/onboarding/targets";
import { cx } from "@/components/ui/primitives";

/**
 * Academy Launch checklist (docs/architecture/onboarding.md).
 *
 * Server-derived, real completion state in; presentation out. The component
 * never computes completion itself and never fakes progress — `view` comes
 * from `resolveChecklist` over live organization data.
 */

function ProgressRing({ percent }: { percent: number }) {
  const r = 15.5;
  const c = 2 * Math.PI * r;
  return (
    <svg width={44} height={44} viewBox="0 0 44 44" aria-hidden>
      <circle
        cx={22}
        cy={22}
        r={r}
        fill="none"
        stroke="var(--border-subtle)"
        strokeWidth={4}
      />
      <circle
        cx={22}
        cy={22}
        r={r}
        fill="none"
        stroke="var(--accent)"
        strokeWidth={4}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - percent / 100)}
        transform="rotate(-90 22 22)"
        style={{
          transition: "stroke-dashoffset var(--motion-slow) var(--ease-out)",
        }}
      />
    </svg>
  );
}

function StepStatusIcon({ complete }: { complete: boolean }) {
  return complete ? (
    <span
      aria-hidden
      className="nk-scale-in flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent text-accent-contrast"
    >
      <svg width={10} height={10} viewBox="0 0 12 12" fill="none">
        <path
          d="M2 6.5 4.5 9 10 3"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  ) : (
    <span
      aria-hidden
      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-border-strong"
    />
  );
}

export function OnboardingChecklist({
  orgSlug,
  view,
  dismissed,
  celebrated,
  canManage,
}: {
  orgSlug: string;
  view: ChecklistView;
  dismissed: boolean;
  celebrated: boolean;
  canManage: boolean;
}) {
  const [expanded, setExpanded] = useState(!view.allComplete);
  const [openWhy, setOpenWhy] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // Observability: viewed once per browser session per org.
  const viewedRef = useRef(false);
  useEffect(() => {
    if (viewedRef.current || dismissed) return;
    viewedRef.current = true;
    const key = `nk-onboarding-viewed:${orgSlug}`;
    try {
      if (window.sessionStorage.getItem(key)) return;
      window.sessionStorage.setItem(key, "1");
    } catch {
      /* fine — at worst we record an extra view */
    }
    void recordOnboardingEventAction(orgSlug, {
      type: "onboarding.checklist.viewed",
    }).catch(() => {});
  }, [dismissed, orgSlug]);

  // One-time completion celebration, recorded so it never replays.
  const celebrateRef = useRef(false);
  useEffect(() => {
    if (view.allComplete && !celebrated && !celebrateRef.current && canManage) {
      celebrateRef.current = true;
      startTransition(() => {
        void celebrateChecklistAction(orgSlug);
      });
    }
  }, [canManage, celebrated, orgSlug, view.allComplete]);

  if (view.totalCount === 0) return null;

  // Hidden state: a quiet restore affordance (org.manage only).
  if (dismissed && !view.allComplete) {
    if (!canManage) return null;
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-border-default px-4 py-2.5">
        <p className="text-body-sm text-text-muted">
          Academy Launch checklist is hidden ({view.completedCount} of{" "}
          {view.totalCount} steps done).
        </p>
        <button
          type="button"
          onClick={() =>
            startTransition(() => void restoreChecklistAction(orgSlug))
          }
          className="nk-press shrink-0 rounded-md border border-border-strong px-3 py-1.5 text-body-sm font-medium text-text-primary hover:bg-surface-interactive"
        >
          Restore
        </button>
      </div>
    );
  }

  // "Academy ready" — completed and previously celebrated: compact state.
  if (view.allComplete && celebrated) {
    return (
      <div
        {...tourTarget(TOUR_TARGETS.launchChecklist)}
        className="flex items-center gap-3 rounded-lg border border-border-subtle bg-surface px-4 py-3"
      >
        <StepStatusIcon complete />
        <p className="text-body-sm text-text-secondary">
          <span className="font-medium text-text-primary">Academy ready.</span>{" "}
          All {view.totalCount} launch steps are complete. Replay any
          walkthrough from the Help menu.
        </p>
      </div>
    );
  }

  const next = view.steps.find((s) => s.id === view.nextStepId) ?? null;

  return (
    <section
      {...tourTarget(TOUR_TARGETS.launchChecklist)}
      aria-label="Academy Launch checklist"
      className="nk-hairline nk-wash rounded-xl border border-border-subtle bg-surface-elevated shadow-raised"
    >
      {/* ---- Header: progress + expand/collapse + dismiss ---------------- */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 px-5 py-4">
        <div className="relative">
          <ProgressRing percent={view.percentComplete} />
          <span className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold tabular-nums text-text-primary">
            {view.percentComplete}%
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-title font-semibold text-text-primary">
            {view.allComplete ? "Your academy is ready 🎉" : "Academy Launch"}
          </h2>
          <p className="mt-0.5 text-body-sm text-text-secondary">
            {view.allComplete
              ? "Every launch step is complete — learners can now experience your academy."
              : `${view.completedCount} of ${view.totalCount} steps complete${
                  next ? ` · next: ${next.title}` : ""
                }`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {canManage && !view.allComplete ? (
            <button
              type="button"
              onClick={() =>
                startTransition(() => void dismissChecklistAction(orgSlug))
              }
              className="nk-press rounded-md px-2.5 py-1.5 text-caption text-text-muted hover:bg-surface-interactive hover:text-text-secondary"
            >
              Hide
            </button>
          ) : null}
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => {
              const next = !expanded;
              setExpanded(next);
              if (next) {
                void recordOnboardingEventAction(orgSlug, {
                  type: "onboarding.checklist.expanded",
                }).catch(() => {});
              }
            }}
            className="nk-press rounded-md border border-border-default px-2.5 py-1.5 text-caption font-medium text-text-secondary hover:bg-surface-interactive"
          >
            {expanded ? "Collapse" : "Expand"}
          </button>
        </div>
      </div>

      {/* ---- Steps -------------------------------------------------------- */}
      {expanded ? (
        <ol className="border-t border-border-subtle">
          {view.steps.map((step) => {
            const isNext = step.id === view.nextStepId;
            return (
              <li
                key={step.id}
                className={cx(
                  "border-b border-border-subtle px-5 py-3 last:border-b-0",
                  isNext && "bg-accent-soft/40",
                )}
              >
                <div className="flex flex-wrap items-start gap-3">
                  <StepStatusIcon complete={step.complete} />
                  <div className="min-w-0 flex-1">
                    <p
                      className={cx(
                        "text-body-sm font-medium",
                        step.complete
                          ? "text-text-muted line-through decoration-border-strong"
                          : "text-text-primary",
                      )}
                    >
                      {step.title}
                      {isNext ? (
                        <span className="ml-2 rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent-contrast">
                          Next
                        </span>
                      ) : null}
                    </p>
                    {!step.complete ? (
                      <>
                        <p className="mt-0.5 text-caption leading-relaxed text-text-secondary">
                          {step.explanation}
                          {step.estimatedMinutes ? (
                            <span className="text-text-muted">
                              {" "}
                              · ~{step.estimatedMinutes} min
                            </span>
                          ) : null}
                        </p>
                        <button
                          type="button"
                          aria-expanded={openWhy === step.id}
                          onClick={() =>
                            setOpenWhy(openWhy === step.id ? null : step.id)
                          }
                          className="mt-1 text-caption font-medium text-accent hover:underline"
                        >
                          Why this matters
                        </button>
                        {openWhy === step.id ? (
                          <p className="nk-fade-up mt-1 text-caption leading-relaxed text-text-muted">
                            {step.whyItMatters}
                          </p>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                  {!step.complete ? (
                    <div className="flex shrink-0 items-center gap-1.5">
                      <StartWalkthroughButton
                        walkthroughId={step.walkthroughId}
                        className="nk-press rounded-md bg-accent px-3 py-1.5 text-caption font-medium text-accent-contrast hover:bg-accent-hover"
                      >
                        Show me
                      </StartWalkthroughButton>
                      <Link
                        href={step.href}
                        className="nk-press rounded-md border border-border-default px-3 py-1.5 text-caption font-medium text-text-secondary hover:bg-surface-interactive hover:text-text-primary"
                      >
                        Take me there
                      </Link>
                    </div>
                  ) : (
                    <span className="text-caption text-text-muted">Done</span>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      ) : null}

      {/* ---- Completion celebration (one-time) ---------------------------- */}
      {view.allComplete && !celebrated ? (
        <div className="nk-scale-in border-t border-border-subtle px-5 py-4">
          <p className="text-body-sm leading-relaxed text-text-secondary">
            <span className="font-medium text-text-primary">
              Congratulations —
            </span>{" "}
            you configured your organization, built and published learning
            content, and brought in your first learner. From here the dashboard
            focuses on operating your academy.
          </p>
        </div>
      ) : null}
    </section>
  );
}
