/**
 * Command-center surfaces (Experience Design System — executive dashboard).
 *
 * NovaIntelligence and PriorityCenter are server-safe and token-driven. Every
 * insight and priority item is derived from a REAL workspace signal by the
 * caller — these components render, they never invent. When there is nothing to
 * surface, each shows a truthful "all clear" state.
 */
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { cx } from "@/components/ui/primitives";
import { Panel, StatusDot } from "@/components/ui/layout";
import { IconAi, IconArrowRight } from "@/components/ui/icons";

type Tone = "accent" | "warning" | "positive" | "danger" | "neutral";

const dotByTone: Record<Tone, string> = {
  accent: "bg-accent",
  warning: "bg-warning",
  positive: "bg-success",
  danger: "bg-danger",
  neutral: "bg-text-muted",
};

const railByTone: Record<Tone, string> = {
  accent: "bg-accent",
  warning: "bg-warning",
  positive: "bg-success",
  danger: "bg-danger",
  neutral: "bg-border-strong",
};

export interface NovaInsight {
  id: string;
  tone: Tone;
  /** One plain-language observation grounded in real data. */
  observation: string;
  detail?: string;
  action?: { label: string; href: string };
}

/**
 * Nova Intelligence — a persistent panel of observations from live workspace
 * signals, each with a recommended action. This surface is defining precisely
 * because it never fabricates: an insight appears only when its real condition
 * holds.
 */
export function NovaIntelligence({ insights }: { insights: NovaInsight[] }) {
  return (
    <Panel tone="elevated" className="nk-wash overflow-hidden rounded-xl p-0">
      <div className="flex items-center gap-2.5 border-b border-border-subtle px-5 py-3.5">
        <span
          aria-hidden
          className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-soft text-accent"
        >
          <IconAi size={16} />
        </span>
        <div className="min-w-0">
          <h2 className="text-title text-text-primary">Nova Intelligence</h2>
          <p className="text-caption text-text-muted">
            Observations from your live workspace signals
          </p>
        </div>
      </div>

      {insights.length === 0 ? (
        <p className="flex items-center gap-2 px-5 py-6 text-body-sm text-text-secondary">
          <StatusDot tone="positive" label="" />
          All clear — nothing needs your attention right now.
        </p>
      ) : (
        <ul className="divide-y divide-border-subtle">
          {insights.map((insight, i) => (
            <li
              key={insight.id}
              className="nk-rise flex items-start gap-3 px-5 py-3.5"
              style={{ "--nk-stagger": String(i) } as CSSProperties}
            >
              <span
                aria-hidden
                className={cx(
                  "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full",
                  dotByTone[insight.tone],
                )}
              />
              <div className="min-w-0 flex-1">
                <p className="text-body-sm text-text-primary">
                  {insight.observation}
                </p>
                {insight.detail ? (
                  <p className="mt-0.5 text-caption text-text-muted">
                    {insight.detail}
                  </p>
                ) : null}
              </div>
              {insight.action ? (
                <Link
                  href={insight.action.href}
                  className="shrink-0 rounded-md border border-border-subtle px-2.5 py-1 text-label font-medium text-text-secondary transition-colors duration-[var(--motion-fast)] hover:border-border-strong hover:bg-surface-interactive hover:text-text-primary"
                >
                  {insight.action.label}
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

export interface PriorityItem {
  id: string;
  band:
    "critical" | "review" | "approval" | "publishing" | "feedback" | "system";
  title: string;
  meta: string;
  href: string;
}

const BANDS: { key: PriorityItem["band"]; label: string; tone: Tone }[] = [
  { key: "critical", label: "Critical", tone: "danger" },
  { key: "review", label: "Needs review", tone: "accent" },
  { key: "approval", label: "Awaiting approval", tone: "accent" },
  { key: "publishing", label: "Publishing", tone: "neutral" },
  { key: "feedback", label: "Feedback", tone: "warning" },
  { key: "system", label: "System", tone: "neutral" },
];

/**
 * Priority Center — the attention queue organized into priority bands with
 * visual weight per band. Only bands that have real, actionable items render.
 */
export function PriorityCenter({
  items,
  emptyLabel = "Nothing is waiting on you — the queue is clear.",
}: {
  items: PriorityItem[];
  emptyLabel?: string;
}) {
  const groups = BANDS.map((band) => ({
    ...band,
    items: items.filter((i) => i.band === band.key),
  })).filter((g) => g.items.length > 0);

  if (groups.length === 0) {
    return (
      <Panel tone="outlined" className="px-4 py-5">
        <p className="flex items-center gap-2 text-body-sm text-text-secondary">
          <StatusDot tone="positive" label="" />
          {emptyLabel}
        </p>
      </Panel>
    );
  }

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <div key={group.key}>
          <div className="flex items-center gap-2 px-0.5">
            <span
              aria-hidden
              className={cx("h-1.5 w-1.5 rounded-full", dotByTone[group.tone])}
            />
            <h3 className="text-label font-medium uppercase tracking-[var(--tracking-caps)] text-text-muted">
              {group.label}
            </h3>
            <span className="text-caption tabular-nums text-text-muted">
              {group.items.length}
            </span>
          </div>
          <ul className="mt-2 space-y-1.5">
            {group.items.map((item) => (
              <li key={item.id}>
                <Link
                  href={item.href}
                  className="nk-card group flex items-center gap-3 rounded-lg border border-border-subtle bg-surface px-3.5 py-3 hover:border-border-strong"
                >
                  <span
                    aria-hidden
                    className={cx(
                      "h-8 w-0.5 shrink-0 rounded-full",
                      railByTone[group.tone],
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body-sm font-medium text-text-primary">
                      {item.title}
                    </span>
                    <span className="block truncate text-caption text-text-muted">
                      {item.meta}
                    </span>
                  </span>
                  <IconArrowRight
                    size={14}
                    className="shrink-0 text-text-muted opacity-0 transition-opacity duration-[var(--motion-fast)] group-hover:opacity-100"
                  />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** Compact hero stat — a labeled figure that sits inside the hero surface. */
export function HeroStat({
  label,
  value,
  children,
}: {
  label: string;
  value?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <p className="text-caption font-medium uppercase tracking-[var(--tracking-caps)] text-text-muted">
        {label}
      </p>
      {value != null ? (
        <p className="mt-1 text-body-sm font-medium text-text-primary">
          {value}
        </p>
      ) : null}
      {children}
    </div>
  );
}
