"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { KnowledgeGraphData } from "@/lib/data/studio";
import { cx } from "@/components/ui/primitives";

/**
 * Knowledge graph (Experience Design System — Knowledge IDE).
 *
 * The organization's knowledge as a living structure: journeys own courses
 * (path_nodes rows), evaluations attach to courses (assignment rows). Every
 * node and edge is a real database row — nothing decorative, nothing
 * inferred. Hover highlights a node's real relationships; click navigates.
 * Hand-rolled SVG on theme tokens; a text equivalent serves assistive tech.
 */

const COL = { journey: 0, course: 1, assessment: 2 } as const;
const COL_X = [10, 50, 90]; // percentage columns
const ROW_H = 44;
const PAD_Y = 28;

interface Node {
  id: string;
  kind: keyof typeof COL;
  title: string;
  sub: string;
  href: string;
  x: number;
  y: number;
}

export function KnowledgeGraph({
  data,
  orgSlug,
  labels,
}: {
  data: KnowledgeGraphData;
  orgSlug: string;
  labels: { journey: string; course: string; assessment: string };
}) {
  const router = useRouter();
  const [hover, setHover] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  const base = `/${orgSlug}/admin`;
  const nodes: Node[] = [
    ...data.journeys.map((j, i) => ({
      id: j.id,
      kind: "journey" as const,
      title: j.title,
      sub: labels.journey,
      href: `${base}/studio/paths/${j.id}`,
      x: COL_X[COL.journey]!,
      y: PAD_Y + i * ROW_H,
    })),
    ...data.courses.map((c, i) => ({
      id: c.id,
      kind: "course" as const,
      title: c.title,
      sub: c.published ? `${labels.course} · live` : `${labels.course} · draft`,
      href: `${base}/courses/${c.id}`,
      x: COL_X[COL.course]!,
      y: PAD_Y + i * ROW_H,
    })),
    ...data.assessments.map((a, i) => ({
      id: a.id,
      kind: "assessment" as const,
      title: a.title,
      sub: labels.assessment,
      href: `${base}/assessments`,
      x: COL_X[COL.assessment]!,
      y: PAD_Y + i * ROW_H,
    })),
  ];
  const byId = new Map(nodes.map((n) => [n.id, n]));

  const edges = [
    ...data.pathEdges.map((e) => ({
      from: e.journeyId,
      to: e.courseId,
      key: `p-${e.journeyId}-${e.courseId}`,
    })),
    ...data.assessmentEdges.map((e) => ({
      from: e.courseId,
      to: e.assessmentId,
      key: `a-${e.assessmentId}-${e.courseId}`,
    })),
  ].filter((e) => byId.has(e.from) && byId.has(e.to));

  if (nodes.length === 0) {
    return (
      <p className="px-5 py-8 text-body-sm text-text-muted">
        The graph appears once {labels.journey.toLowerCase()}s and{" "}
        {labels.course.toLowerCase()}s exist — every connection drawn is a real
        relationship.
      </p>
    );
  }

  // Nodes with no edges at all: knowledge learners may never be routed to.
  const linked = new Set<string>();
  for (const e of edges) {
    linked.add(e.from);
    linked.add(e.to);
  }

  // Emphasis = the hovered node's real connections ∩ the text filter.
  const q = filter.trim().toLowerCase();
  const matchesFilter = (n: Node) => !q || n.title.toLowerCase().includes(q);
  const connected = new Set<string>();
  if (hover) {
    connected.add(hover);
    for (const e of edges) {
      if (e.from === hover) connected.add(e.to);
      if (e.to === hover) connected.add(e.from);
    }
  }
  const emphasized = (id: string): boolean => {
    const node = byId.get(id);
    if (!node) return false;
    if (hover) return connected.has(id);
    return matchesFilter(node);
  };
  const anyEmphasis = hover !== null || q.length > 0;

  const height =
    PAD_Y * 2 +
    ROW_H *
      Math.max(
        data.journeys.length,
        data.courses.length,
        data.assessments.length,
        1,
      );

  return (
    <div>
      <label className="relative mb-3 block max-w-xs">
        <span className="sr-only">Filter the knowledge graph</span>
        <input
          type="search"
          placeholder="Filter the graph…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="w-full rounded-md border border-border-subtle bg-surface px-3 py-1.5 text-body-sm text-text-primary outline-none transition-[border-color,box-shadow] duration-[var(--motion-fast)] placeholder:text-text-muted focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-soft)]"
        />
      </label>
      <svg
        viewBox={`0 0 100 ${height}`}
        preserveAspectRatio="none"
        className="h-auto w-full"
        style={{ minHeight: Math.min(height * 4, 460) }}
        aria-hidden
      >
        {edges.map((edge) => {
          const from = byId.get(edge.from)!;
          const to = byId.get(edge.to)!;
          const lit =
            hover !== null && (edge.from === hover || edge.to === hover);
          const dimmed =
            anyEmphasis &&
            !lit &&
            !(emphasized(edge.from) && emphasized(edge.to));
          const midX = (from.x + to.x) / 2;
          return (
            <path
              key={edge.key}
              d={`M ${from.x} ${from.y} C ${midX} ${from.y}, ${midX} ${to.y}, ${to.x} ${to.y}`}
              fill="none"
              stroke={lit ? "var(--accent)" : "var(--border-default)"}
              strokeWidth={lit ? 0.7 : 0.35}
              opacity={dimmed ? 0.3 : 1}
              vectorEffect="non-scaling-stroke"
              style={{
                transition:
                  "stroke var(--motion-fast) var(--ease-out), opacity var(--motion-fast) var(--ease-out)",
              }}
            />
          );
        })}
        {nodes.map((node) => {
          const dim = anyEmphasis && !emphasized(node.id);
          return (
            <circle
              key={node.id}
              cx={node.x}
              cy={node.y}
              r={node.kind === "course" ? 2.2 : 1.8}
              fill={
                node.id === hover
                  ? "var(--accent)"
                  : node.kind === "course"
                    ? "var(--accent)"
                    : "var(--border-strong)"
              }
              opacity={dim ? 0.3 : 1}
              style={{
                transition: "opacity var(--motion-fast) var(--ease-out)",
              }}
            />
          );
        })}
      </svg>

      {/* The interactive layer: real HTML controls aligned to the columns —
          keyboard focusable, screen-reader readable, clickable. */}
      <div className="mt-4 grid grid-cols-3 gap-3">
        {(
          [
            ["journey", data.journeys.map((j) => j.id)],
            ["course", data.courses.map((c) => c.id)],
            ["assessment", data.assessments.map((a) => a.id)],
          ] as const
        ).map(([kind, ids]) => (
          <div key={kind} className="min-w-0">
            <p className="mb-1.5 text-caption font-medium uppercase tracking-[var(--tracking-caps)] text-text-muted">
              {labels[kind]}
              {ids.length === 1 ? "" : "s"}
              <span className="ml-1.5 tabular-nums">{ids.length}</span>
            </p>
            <ul className="space-y-0.5">
              {ids.map((nodeId) => {
                const node = byId.get(nodeId)!;
                const dim = anyEmphasis && !emphasized(nodeId);
                const isolated = !linked.has(nodeId);
                return (
                  <li key={nodeId}>
                    <button
                      type="button"
                      title={node.sub}
                      onMouseEnter={() => setHover(nodeId)}
                      onMouseLeave={() => setHover(null)}
                      onFocus={() => setHover(nodeId)}
                      onBlur={() => setHover(null)}
                      onClick={() => router.push(node.href)}
                      className={cx(
                        "flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-body-sm transition-[color,background-color,opacity] duration-[var(--motion-fast)]",
                        nodeId === hover
                          ? "bg-accent-soft text-accent"
                          : "text-text-secondary hover:bg-surface-interactive hover:text-text-primary",
                        dim && "opacity-40",
                      )}
                    >
                      <span className="truncate">{node.title}</span>
                      {isolated ? (
                        <span className="ml-auto shrink-0 rounded-full bg-warning/10 px-1.5 text-[10px] font-medium text-warning">
                          isolated
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
