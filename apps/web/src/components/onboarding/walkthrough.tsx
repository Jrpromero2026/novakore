"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  resolveTerm,
  type Permission,
  type TerminologyOverrides,
  type TermKey,
} from "@novakore/domain";
import {
  availableWalkthroughs,
  getWalkthrough,
  type WalkthroughDefinition,
  type WalkthroughStepDefinition,
} from "@/lib/onboarding/registry";
import { TOUR_ATTR, type TourTargetId } from "@/lib/onboarding/targets";
import { cx } from "@/components/ui/primitives";

/**
 * Walkthrough engine (docs/architecture/onboarding.md).
 *
 * Renders guided tours purely from the central registry. Design rules:
 *  - never simulates a user action, never creates content;
 *  - never traps: Escape and the Exit button always work, and the dim
 *    layer is visual only (pointer-events: none) so the app underneath
 *    stays fully usable by mouse, keyboard, and assistive technology;
 *  - waits for REAL completion signals (route changes, server-rendered
 *    `data-tour-state-*` counts) before advancing condition steps;
 *  - recovers when a target is missing (skip / exit, telemetry recorded).
 */

export interface WalkthroughEventInput {
  type: string;
  stepId?: string;
  walkthroughId?: string;
  data?: Record<string, unknown>;
}

interface WalkthroughContextValue {
  /** Permission-filtered walkthroughs available to this member. */
  available: WalkthroughDefinition[];
  activeId: string | null;
  start: (id: string) => void;
  exit: () => void;
  term: (key: TermKey) => { singular: string; plural: string };
}

const WalkthroughContext = createContext<WalkthroughContextValue | null>(null);

export function useWalkthrough(): WalkthroughContextValue {
  const ctx = useContext(WalkthroughContext);
  if (!ctx) {
    throw new Error("useWalkthrough must be used inside WalkthroughProvider");
  }
  return ctx;
}

/** Per-org resume state. Keyed by org id — never leaks across tenants. */
const storageKey = (orgId: string) => `nk-tour:${orgId}`;

interface StoredProgress {
  id: string;
  version: number;
  stepIndex: number;
}

function readProgress(orgId: string): StoredProgress | null {
  try {
    const raw = window.localStorage.getItem(storageKey(orgId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as StoredProgress).id === "string" &&
      typeof (parsed as StoredProgress).version === "number" &&
      typeof (parsed as StoredProgress).stepIndex === "number"
    ) {
      return parsed as StoredProgress;
    }
    return null;
  } catch {
    return null;
  }
}

function writeProgress(orgId: string, progress: StoredProgress | null) {
  try {
    if (progress === null) window.localStorage.removeItem(storageKey(orgId));
    else
      window.localStorage.setItem(storageKey(orgId), JSON.stringify(progress));
  } catch {
    /* storage unavailable — tours still work, they just don't resume */
  }
}

/** Pick the visible element for a target id (desktop rail vs mobile drawer). */
function findTargetElement(id: TourTargetId): HTMLElement | null {
  const candidates = document.querySelectorAll<HTMLElement>(
    `[${TOUR_ATTR}="${id}"]`,
  );
  for (const el of candidates) {
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) return el;
  }
  return null;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

type StepStatus = "locating" | "ready" | "missing";

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const TARGET_TIMEOUT_MS = 4000;

export function WalkthroughProvider({
  orgId,
  orgSlug,
  permissions,
  terminologyOverrides,
  recordEvent,
  children,
}: {
  orgId: string;
  orgSlug: string;
  permissions: readonly string[];
  terminologyOverrides: TerminologyOverrides;
  /** Bound server action; fire-and-forget from the engine. */
  recordEvent: (
    orgSlug: string,
    input: WalkthroughEventInput,
  ) => Promise<unknown>;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const base = `/${orgSlug}/admin`;

  const available = useMemo(
    () => availableWalkthroughs(permissions as readonly Permission[]),
    [permissions],
  );
  const term = useCallback(
    (key: TermKey) => resolveTerm(key, terminologyOverrides),
    [terminologyOverrides],
  );

  const [active, setActive] = useState<{
    id: string;
    stepIndex: number;
  } | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  const emit = useCallback(
    (input: WalkthroughEventInput) => {
      void recordEvent(orgSlug, input).catch(() => {
        /* observability only — never interrupt the tour */
      });
    },
    [recordEvent, orgSlug],
  );

  const definition = active ? getWalkthrough(active.id) : undefined;
  // Only walkthroughs this member may run are ever rendered.
  const permitted =
    definition && available.some((w) => w.id === definition.id)
      ? definition
      : undefined;
  const step: WalkthroughStepDefinition | undefined =
    permitted?.steps[active?.stepIndex ?? 0];

  const exit = useCallback(() => {
    if (active) {
      emit({
        type: "onboarding.walkthrough.exited",
        walkthroughId: active.id,
        stepId: permitted?.steps[active.stepIndex]?.id,
      });
    }
    setActive(null);
    writeProgress(orgId, null);
    const el = restoreFocusRef.current;
    restoreFocusRef.current = null;
    if (el && el.isConnected) el.focus();
  }, [active, emit, orgId, permitted]);

  const start = useCallback(
    (id: string) => {
      const def = available.find((w) => w.id === id);
      if (!def || def.steps.length === 0) return;
      restoreFocusRef.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      setActive({ id, stepIndex: 0 });
      writeProgress(orgId, { id, version: def.version, stepIndex: 0 });
      emit({ type: "onboarding.walkthrough.started", walkthroughId: id });
      emit({
        type: "onboarding.step.started",
        walkthroughId: id,
        stepId: def.steps[0]!.id,
      });
      const route = def.steps[0]!.route(base);
      if (!pathname.startsWith(route)) {
        router.push(route);
      }
    },
    [available, base, emit, orgId, pathname, router],
  );

  // Resume a stored tour once on mount (version mismatch discards cleanly).
  const resumedRef = useRef(false);
  useEffect(() => {
    if (resumedRef.current) return;
    resumedRef.current = true;
    // Deferred: restores after hydration without setting state mid-effect.
    const timer = window.setTimeout(() => {
      const stored = readProgress(orgId);
      if (!stored) return;
      const def = available.find((w) => w.id === stored.id);
      if (!def || def.version !== stored.version) {
        writeProgress(orgId, null);
        return;
      }
      const stepIndex = Math.min(stored.stepIndex, def.steps.length - 1);
      setActive({ id: stored.id, stepIndex });
      emit({
        type: "onboarding.walkthrough.resumed",
        walkthroughId: stored.id,
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [available, emit, orgId]);

  const goToStep = useCallback(
    (index: number, reason: "next" | "back" | "skip" | "completed") => {
      if (!permitted || !active) return;
      const current = permitted.steps[active.stepIndex];
      if (current) {
        if (reason === "completed" || reason === "next") {
          emit({
            type: "onboarding.step.completed",
            walkthroughId: permitted.id,
            stepId: current.id,
          });
        } else if (reason === "skip") {
          emit({
            type: "onboarding.step.skipped",
            walkthroughId: permitted.id,
            stepId: current.id,
          });
        }
      }
      if (index >= permitted.steps.length) {
        emit({
          type: "onboarding.walkthrough.completed",
          walkthroughId: permitted.id,
        });
        setActive(null);
        writeProgress(orgId, null);
        const el = restoreFocusRef.current;
        restoreFocusRef.current = null;
        if (el && el.isConnected) el.focus();
        return;
      }
      const next = permitted.steps[index]!;
      setActive({ id: permitted.id, stepIndex: index });
      writeProgress(orgId, {
        id: permitted.id,
        version: permitted.version,
        stepIndex: index,
      });
      emit({
        type: "onboarding.step.started",
        walkthroughId: permitted.id,
        stepId: next.id,
      });
      const route = next.route(base);
      if (!pathname.startsWith(route)) {
        router.push(route);
      }
    },
    [active, base, emit, orgId, pathname, permitted, router],
  );

  const value = useMemo<WalkthroughContextValue>(
    () => ({
      available,
      activeId: active?.id ?? null,
      start,
      exit,
      term,
    }),
    [available, active, start, exit, term],
  );

  return (
    <WalkthroughContext.Provider value={value}>
      {children}
      {permitted && step && active ? (
        <WalkthroughOverlay
          key={`${permitted.id}:${active.stepIndex}`}
          definition={permitted}
          step={step}
          stepIndex={active.stepIndex}
          base={base}
          pathname={pathname}
          term={term}
          onBack={
            active.stepIndex > 0
              ? () => goToStep(active.stepIndex - 1, "back")
              : undefined
          }
          onNext={() => goToStep(active.stepIndex + 1, "next")}
          onSkip={() => goToStep(active.stepIndex + 1, "skip")}
          onConditionMet={() => goToStep(active.stepIndex + 1, "completed")}
          onExit={exit}
          onEvent={emit}
        />
      ) : null}
    </WalkthroughContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Overlay + coachmark
// ---------------------------------------------------------------------------

function WalkthroughOverlay({
  definition,
  step,
  stepIndex,
  base,
  pathname,
  term,
  onBack,
  onNext,
  onSkip,
  onConditionMet,
  onExit,
  onEvent,
}: {
  definition: WalkthroughDefinition;
  step: WalkthroughStepDefinition;
  stepIndex: number;
  base: string;
  pathname: string;
  term: (key: TermKey) => { singular: string; plural: string };
  onBack?: () => void;
  onNext: () => void;
  onSkip: () => void;
  onConditionMet: () => void;
  onExit: () => void;
  onEvent: (input: WalkthroughEventInput) => void;
}) {
  const [status, setStatus] = useState<StepStatus>("locating");
  const [rect, setRect] = useState<Rect | null>(null);
  const targetRef = useRef<HTMLElement | null>(null);
  const coachmarkRef = useRef<HTMLDivElement | null>(null);
  const missingReportedRef = useRef(false);
  const conditionFiredRef = useRef(false);

  // Both latches belong to a STEP, not to the walkthrough. Left unreset,
  // `conditionFiredRef` lets the engine auto-advance exactly one condition
  // step per tour and silently stalls every later one — which stayed hidden
  // until a walkthrough first had two already-satisfied condition steps in a
  // row. Declared before the effects that read them so React runs the reset
  // first on the commit where the step changes; keyed on `step` alone so a
  // mid-step route change cannot clear a latch and double-advance.
  useEffect(() => {
    conditionFiredRef.current = false;
    missingReportedRef.current = false;
  }, [step]);

  const onRoute = pathname.startsWith(step.route(base));
  // Latest pathname for interval closures (App Router owns the URL).
  const pathnameRef = useRef(pathname);
  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  // ---- Locate the target (async-safe: observer + retry + timeout) ---------
  useEffect(() => {
    if (!onRoute) return;
    let cancelled = false;
    let settled = false;
    // Elapsed time is counted in interval ticks (not wall clock) so the
    // timeout is deterministic under test fake timers and background tabs.
    let elapsedMs = 0;

    const attempt = () => {
      if (cancelled || settled) return;
      const el =
        findTargetElement(step.target) ??
        (step.fallbackTarget ? findTargetElement(step.fallbackTarget) : null);
      if (el) {
        settled = true;
        targetRef.current = el;
        el.scrollIntoView({
          block: "center",
          behavior: prefersReducedMotion() ? "auto" : "smooth",
        });
        setStatus("ready");
        return;
      }
      if (elapsedMs > TARGET_TIMEOUT_MS) {
        settled = true;
        setStatus("missing");
        if (!missingReportedRef.current) {
          missingReportedRef.current = true;
          onEvent({
            type: "onboarding.walkthrough.target_missing",
            walkthroughId: definition.id,
            stepId: step.id,
            data: { target: step.target },
          });
        }
      }
    };

    // First attempt is deferred — effects must not set state synchronously.
    const kickoff = window.setTimeout(attempt, 0);
    const interval = window.setInterval(() => {
      elapsedMs += 250;
      attempt();
    }, 250);
    const observer = new MutationObserver(attempt);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      cancelled = true;
      window.clearTimeout(kickoff);
      window.clearInterval(interval);
      observer.disconnect();
    };
  }, [definition.id, onEvent, onRoute, step]);

  // ---- Track the target's rectangle while visible -------------------------
  useEffect(() => {
    if (status !== "ready") return;
    const update = () => {
      const el = targetRef.current;
      if (!el || !el.isConnected) return;
      const r = el.getBoundingClientRect();
      setRect((prev) =>
        prev &&
        prev.top === r.top &&
        prev.left === r.left &&
        prev.width === r.width &&
        prev.height === r.height
          ? prev
          : { top: r.top, left: r.left, width: r.width, height: r.height },
      );
    };
    const kickoff = window.setTimeout(update, 0);
    const interval = window.setInterval(update, 300);
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.clearTimeout(kickoff);
      window.clearInterval(interval);
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [status]);

  // ---- Condition polling: advance only when the REAL action happened -----
  useEffect(() => {
    if (step.advance !== "condition" || !step.completeWhen) return;
    const check = () => {
      if (conditionFiredRef.current) return;
      if (
        step.completeWhen!({
          pathname: pathnameRef.current,
          base,
          doc: document,
        })
      ) {
        conditionFiredRef.current = true;
        onConditionMet();
      }
    };
    const kickoff = window.setTimeout(check, 0);
    const interval = window.setInterval(check, 500);
    return () => {
      window.clearTimeout(kickoff);
      window.clearInterval(interval);
    };
  }, [base, onConditionMet, pathname, step]);

  // ---- Keyboard: Escape always exits --------------------------------------
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onExit();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [onExit]);

  // ---- Focus the coachmark when it appears --------------------------------
  useEffect(() => {
    if (status === "locating") return;
    coachmarkRef.current?.focus();
  }, [status]);

  const totalSteps = definition.steps.length;
  const reduced = prefersReducedMotion();
  // Off-route (user navigated away mid-step): render as locating, never a
  // stale highlight.
  const effectiveStatus: StepStatus = onRoute ? status : "locating";

  // Coachmark placement relative to the highlight, clamped to the viewport.
  const coachmarkStyle: CSSProperties = { position: "fixed", zIndex: 60 };
  const MARGIN = 12;
  const WIDTH = 340;
  if (effectiveStatus === "ready" && rect) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const width = Math.min(WIDTH, vw - 24);
    let placement = step.placement;
    // Flip when there is clearly no room on the requested side.
    if (placement === "right" && rect.left + rect.width + width + MARGIN > vw)
      placement = "bottom";
    if (placement === "left" && rect.left - width - MARGIN < 0)
      placement = "bottom";
    if (placement === "bottom" && rect.top + rect.height + 220 > vh)
      placement = "top";
    if (placement === "top" && rect.top - 220 < 0) placement = "bottom";

    coachmarkStyle.width = width;
    if (placement === "right") {
      coachmarkStyle.left = Math.min(
        rect.left + rect.width + MARGIN,
        vw - width - 12,
      );
      coachmarkStyle.top = Math.max(12, Math.min(rect.top, vh - 240));
    } else if (placement === "left") {
      coachmarkStyle.left = Math.max(12, rect.left - width - MARGIN);
      coachmarkStyle.top = Math.max(12, Math.min(rect.top, vh - 240));
    } else if (placement === "bottom") {
      coachmarkStyle.left = Math.max(12, Math.min(rect.left, vw - width - 12));
      coachmarkStyle.top = Math.min(rect.top + rect.height + MARGIN, vh - 240);
    } else {
      coachmarkStyle.left = Math.max(12, Math.min(rect.left, vw - width - 12));
      coachmarkStyle.bottom = Math.max(12, vh - rect.top + MARGIN);
    }
  } else {
    // Centered fallback (waiting for route/target, or missing-target recovery).
    coachmarkStyle.left = "50%";
    coachmarkStyle.top = "50%";
    coachmarkStyle.transform = "translate(-50%, -50%)";
    coachmarkStyle.width = Math.min(WIDTH, 360);
    coachmarkStyle.maxWidth = "calc(100vw - 24px)";
  }

  const PAD = 6;

  return (
    <>
      {/* Visual dim + highlight. pointer-events: none everywhere so the app
          underneath (including the highlighted control) stays fully usable. */}
      {effectiveStatus === "ready" && rect ? (
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0"
          style={{ zIndex: 55 }}
        >
          {/* Four dim panels around the highlight hole. */}
          <div
            className="absolute inset-x-0 top-0 bg-[rgb(0_0_0/0.38)]"
            style={{ height: Math.max(0, rect.top - PAD) }}
          />
          <div
            className="absolute inset-x-0 bottom-0 bg-[rgb(0_0_0/0.38)]"
            style={{
              top: rect.top + rect.height + PAD,
            }}
          />
          <div
            className="absolute left-0 bg-[rgb(0_0_0/0.38)]"
            style={{
              top: Math.max(0, rect.top - PAD),
              height: rect.height + PAD * 2,
              width: Math.max(0, rect.left - PAD),
            }}
          />
          <div
            className="absolute right-0 bg-[rgb(0_0_0/0.38)]"
            style={{
              top: Math.max(0, rect.top - PAD),
              height: rect.height + PAD * 2,
              left: rect.left + rect.width + PAD,
            }}
          />
          {/* Accent focus ring around the live target. */}
          <div
            className={cx(
              "absolute rounded-lg border-2 border-accent",
              !reduced && "nk-scale-in",
            )}
            style={{
              top: rect.top - PAD,
              left: rect.left - PAD,
              width: rect.width + PAD * 2,
              height: rect.height + PAD * 2,
              boxShadow: "0 0 0 4px var(--accent-soft)",
            }}
          />
        </div>
      ) : null}

      {/* Coachmark */}
      <div
        ref={coachmarkRef}
        role="dialog"
        aria-modal={false}
        aria-label={`${definition.title(term)} — step ${stepIndex + 1} of ${totalSteps}`}
        tabIndex={-1}
        style={coachmarkStyle}
        className={cx(
          "rounded-lg border border-border-default bg-background-elevated p-4 shadow-overlay outline-none",
          !reduced && "nk-scale-in",
        )}
      >
        <p
          aria-live="polite"
          className="text-caption font-medium uppercase tracking-[var(--tracking-caps)] text-text-muted"
        >
          Step {stepIndex + 1} of {totalSteps}
        </p>

        {effectiveStatus === "missing" ? (
          <>
            <h2 className="mt-1.5 text-title font-semibold text-text-primary">
              We couldn&apos;t find that control
            </h2>
            <p className="mt-1.5 text-body-sm leading-relaxed text-text-secondary">
              The page may have changed, or this control may not be available
              right now. You can skip this step or leave the walkthrough —
              nothing is lost.
            </p>
          </>
        ) : (
          <>
            <h2 className="mt-1.5 text-title font-semibold text-text-primary">
              {step.title(term)}
            </h2>
            <p className="mt-1.5 text-body-sm leading-relaxed text-text-secondary">
              {step.body(term)}
            </p>
            {effectiveStatus === "locating" ? (
              <p className="mt-2 text-caption text-text-muted">
                Waiting for the page to be ready…
              </p>
            ) : null}
            {effectiveStatus === "ready" &&
            step.advance === "condition" &&
            step.waitHint ? (
              <p
                className="mt-2 flex items-center gap-1.5 text-caption text-accent"
                role="status"
              >
                <span
                  aria-hidden
                  className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
                />
                {step.waitHint(term)}
              </p>
            ) : null}
          </>
        )}

        <div className="mt-3.5 flex flex-wrap items-center gap-2">
          {effectiveStatus === "missing" ? (
            <button
              type="button"
              onClick={() => {
                onEvent({
                  type: "onboarding.walkthrough.recovered",
                  walkthroughId: definition.id,
                  stepId: step.id,
                });
                onSkip();
              }}
              className="nk-press rounded-md bg-accent px-3 py-1.5 text-body-sm font-medium text-accent-contrast hover:bg-accent-hover"
            >
              Skip this step
            </button>
          ) : (
            <>
              {step.advance === "next" ? (
                <button
                  type="button"
                  onClick={onNext}
                  className="nk-press rounded-md bg-accent px-3 py-1.5 text-body-sm font-medium text-accent-contrast hover:bg-accent-hover"
                >
                  {stepIndex + 1 === totalSteps ? "Done" : "Next"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onSkip}
                  className="nk-press rounded-md border border-border-strong px-3 py-1.5 text-body-sm font-medium text-text-primary hover:bg-surface-interactive"
                >
                  Skip step
                </button>
              )}
            </>
          )}
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="nk-press rounded-md border border-border-default px-3 py-1.5 text-body-sm text-text-secondary hover:bg-surface-interactive"
            >
              Back
            </button>
          ) : null}
          <button
            type="button"
            onClick={onExit}
            className="nk-press ml-auto rounded-md px-2.5 py-1.5 text-body-sm text-text-muted hover:bg-surface-interactive hover:text-text-primary"
          >
            Exit tour
          </button>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Start button — reusable trigger for checklist rows, empty states, Help.
// ---------------------------------------------------------------------------

export function StartWalkthroughButton({
  walkthroughId,
  className,
  children,
}: {
  walkthroughId: string;
  className?: string;
  children: ReactNode;
}) {
  const { available, start } = useWalkthrough();
  if (!available.some((w) => w.id === walkthroughId)) return null;
  return (
    <button
      type="button"
      onClick={() => start(walkthroughId)}
      className={className}
    >
      {children}
    </button>
  );
}
