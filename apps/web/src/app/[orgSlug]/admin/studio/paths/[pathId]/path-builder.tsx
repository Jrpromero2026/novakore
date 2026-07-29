"use client";

import { useMemo, useState, useTransition } from "react";
import {
  describePrerequisites,
  validatePathGraph,
  type PathGraphReport,
} from "@novakore/domain";
import {
  addPathNodeAction,
  addPrerequisiteAction,
  removePrerequisiteAction,
} from "@/lib/actions/learning";
import {
  removePathNodeAction,
  savePathLayoutAction,
} from "@/lib/actions/studio";
import { idle, type ActionState } from "@/lib/actions/types";
import type { PathBuilderData } from "@/lib/data/studio";
import {
  ActionBanner,
  Badge,
  Button,
  Card,
  CardHeader,
  Select,
} from "@/components/ui/primitives";
import { Alert } from "@/components/ui/feedback";

/**
 * Visual path builder. The SVG canvas is presentation; the domain model
 * (nodes + prerequisites) is authoritative. Everything the canvas does is
 * mirrored in a keyboard-accessible, screen-reader-ordered list below —
 * the canvas is never the only way to edit.
 */

const NODE_W = 168;
const NODE_H = 64;
const COL = 240;
const ROW = 110;

export function PathBuilder({
  orgSlug,
  data,
  canManage,
  courseTerm,
}: {
  orgSlug: string;
  data: PathBuilderData;
  canManage: boolean;
  courseTerm: string;
}) {
  const [feedback, setFeedback] = useState<ActionState>(idle);
  const [pending, startTransition] = useTransition();
  const [addCourse, setAddCourse] = useState("");
  const [fromNode, setFromNode] = useState("");
  const [requiresNode, setRequiresNode] = useState("");

  const run = (fn: () => Promise<ActionState>) =>
    startTransition(async () => setFeedback(await fn()));

  const report: PathGraphReport = data.report;
  const titleById = useMemo(
    () => new Map(data.nodes.map((n) => [n.nodeId, n.title])),
    [data.nodes],
  );

  // deterministic layout: saved positions or a tidy prerequisite-depth grid
  const layoutPositions = useMemo(() => {
    const saved = new Map(
      (data.layout?.positions ?? []).map((p) => [p.nodeId, { x: p.x, y: p.y }]),
    );
    const depth = new Map<string, number>();
    const compute = (id: string, seen: Set<string>): number => {
      if (depth.has(id)) return depth.get(id)!;
      if (seen.has(id)) return 0;
      seen.add(id);
      const reqs = data.prerequisites
        .filter((e) => e.nodeId === id)
        .map((e) => e.requiresNodeId);
      const d =
        reqs.length === 0
          ? 0
          : Math.max(...reqs.map((r) => compute(r, seen) + 1));
      depth.set(id, d);
      return d;
    };
    const rowCounter = new Map<number, number>();
    return new Map(
      data.nodes.map((node) => {
        if (saved.has(node.nodeId))
          return [node.nodeId, saved.get(node.nodeId)!];
        const d = compute(node.nodeId, new Set());
        const row = rowCounter.get(d) ?? 0;
        rowCounter.set(d, row + 1);
        return [node.nodeId, { x: 40 + d * COL, y: 20 + row * ROW }];
      }),
    );
  }, [data.nodes, data.prerequisites, data.layout]);

  const canvasWidth = Math.max(
    600,
    ...[...layoutPositions.values()].map((p) => p.x + NODE_W + 40),
  );
  const canvasHeight = Math.max(
    240,
    ...[...layoutPositions.values()].map((p) => p.y + NODE_H + 40),
  );

  const saveTidyLayout = () =>
    run(() =>
      savePathLayoutAction(orgSlug, data.pathId, {
        schemaVersion: 1,
        positions: data.nodes.map((n) => ({
          nodeId: n.nodeId,
          x: layoutPositions.get(n.nodeId)!.x,
          y: layoutPositions.get(n.nodeId)!.y,
        })),
      }),
    );

  return (
    <div className="space-y-4">
      {report.cycleNodeIds.length > 0 ? (
        <Alert tone="danger" title="Invalid prerequisites">
          {report.cycleNodeIds.length} node(s) form a cycle. Learners could
          never progress — remove a prerequisite to break the loop.
        </Alert>
      ) : null}
      {report.unreachableNodeIds.length > 0 &&
      report.cycleNodeIds.length === 0 ? (
        <Alert tone="warning" title="Unreachable content">
          Some nodes can never unlock because a prerequisite chain is broken.
        </Alert>
      ) : null}
      {report.orphanNodeIds.length > 0 ? (
        <Alert tone="info" title="Isolated nodes">
          {report.orphanNodeIds.length} node(s) have no connection to the rest
          of the {courseTerm.toLowerCase()} graph.
        </Alert>
      ) : null}

      <Card>
        <CardHeader
          title="Canvas"
          description="Visual overview — the ordered list below is the accessible, authoritative editor."
        />
        <div className="overflow-auto px-5 py-4">
          <svg
            role="img"
            aria-label={`Visual graph of ${data.nodes.length} nodes`}
            width={canvasWidth}
            height={canvasHeight}
            className="min-w-full"
          >
            {data.prerequisites.map((edge) => {
              const from = layoutPositions.get(edge.requiresNodeId);
              const to = layoutPositions.get(edge.nodeId);
              if (!from || !to) return null;
              const cyclic =
                report.cycleNodeIds.includes(edge.nodeId) &&
                report.cycleNodeIds.includes(edge.requiresNodeId);
              return (
                <line
                  key={edge.id}
                  x1={from.x + NODE_W}
                  y1={from.y + NODE_H / 2}
                  x2={to.x}
                  y2={to.y + NODE_H / 2}
                  stroke={
                    cyclic
                      ? "var(--color-danger)"
                      : "var(--color-border-strong)"
                  }
                  strokeWidth={cyclic ? 2 : 1.5}
                  markerEnd="url(#arrow)"
                />
              );
            })}
            <defs>
              <marker
                id="arrow"
                markerWidth="8"
                markerHeight="8"
                refX="7"
                refY="4"
                orient="auto"
              >
                <path d="M0,0 L8,4 L0,8 z" fill="var(--color-border-strong)" />
              </marker>
            </defs>
            {data.nodes.map((node) => {
              const pos = layoutPositions.get(node.nodeId)!;
              const cyclic = report.cycleNodeIds.includes(node.nodeId);
              const unreachable = report.unreachableNodeIds.includes(
                node.nodeId,
              );
              return (
                <g key={node.nodeId} transform={`translate(${pos.x},${pos.y})`}>
                  <rect
                    width={NODE_W}
                    height={NODE_H}
                    rx={8}
                    fill="var(--color-surface)"
                    stroke={
                      cyclic
                        ? "var(--color-danger)"
                        : unreachable
                          ? "var(--color-warning)"
                          : "var(--color-border-default)"
                    }
                    strokeWidth={1.5}
                  />
                  <text
                    x={12}
                    y={26}
                    fill="var(--color-text-primary)"
                    fontSize="13"
                    fontWeight="500"
                  >
                    {node.title.length > 20
                      ? `${node.title.slice(0, 19)}…`
                      : node.title}
                  </text>
                  <text
                    x={12}
                    y={46}
                    fill="var(--color-text-muted)"
                    fontSize="11"
                  >
                    {node.published ? "published" : "unpublished"}
                    {report.startNodeIds.includes(node.nodeId)
                      ? " · start"
                      : ""}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
        {canManage ? (
          <div className="border-t border-border-subtle px-5 py-3">
            <Button
              variant="ghost"
              className="text-xs"
              disabled={pending}
              onClick={saveTidyLayout}
            >
              Save this layout
            </Button>
          </div>
        ) : null}
      </Card>

      <Card>
        <CardHeader
          title="Nodes & prerequisites"
          description="The authoritative, keyboard-accessible representation."
        />
        <ol className="divide-y divide-border-subtle">
          {data.nodes.map((node, index) => {
            const requires = data.prerequisites
              .filter((e) => e.nodeId === node.nodeId)
              .map((e) => e.requiresNodeId);
            return (
              <li key={node.nodeId} className="space-y-1 px-5 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-caption tabular-nums text-text-muted">
                    {index + 1}.
                  </span>
                  <span className="min-w-0 flex-1 text-body font-medium text-text-primary">
                    {node.title}
                  </span>
                  <Badge tone={node.published ? "positive" : "warning"}>
                    {node.published ? "published" : "unpublished"}
                  </Badge>
                  {report.startNodeIds.includes(node.nodeId) ? (
                    <Badge tone="accent">start</Badge>
                  ) : null}
                  {report.cycleNodeIds.includes(node.nodeId) ? (
                    <Badge tone="danger">in cycle</Badge>
                  ) : report.unreachableNodeIds.includes(node.nodeId) ? (
                    <Badge tone="warning">unreachable</Badge>
                  ) : null}
                  {canManage ? (
                    <Button
                      variant="ghost"
                      className="px-2 text-xs"
                      disabled={pending}
                      aria-label={`Remove ${node.title}`}
                      onClick={() =>
                        run(() => removePathNodeAction(orgSlug, node.nodeId))
                      }
                    >
                      ✕
                    </Button>
                  ) : null}
                </div>
                <p className="pl-6 text-caption text-text-muted">
                  {describePrerequisites({
                    titlesById: titleById,
                    requires,
                    required: true,
                  })}
                </p>
                {canManage && requires.length > 0 ? (
                  <div className="flex flex-wrap gap-1 pl-6">
                    {data.prerequisites
                      .filter((e) => e.nodeId === node.nodeId)
                      .map((edge) => (
                        <Button
                          key={edge.id}
                          variant="ghost"
                          className="text-xs"
                          disabled={pending}
                          onClick={() =>
                            run(() =>
                              removePrerequisiteAction(orgSlug, edge.id),
                            )
                          }
                        >
                          remove “{titleById.get(edge.requiresNodeId)}”
                          requirement ✕
                        </Button>
                      ))}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>

        {canManage ? (
          <div className="space-y-3 border-t border-border-subtle px-5 py-4">
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-56 flex-1">
                <label
                  htmlFor="add-course"
                  className="mb-1 block text-caption text-text-muted"
                >
                  Add {courseTerm.toLowerCase()} node
                </label>
                <Select
                  id="add-course"
                  value={addCourse}
                  onChange={(e) => setAddCourse(e.target.value)}
                >
                  <option value="">Choose…</option>
                  {data.availableCourses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </Select>
              </div>
              <Button
                variant="secondary"
                disabled={pending || addCourse === ""}
                onClick={() =>
                  run(async () => {
                    const result = await addPathNodeAction(
                      orgSlug,
                      data.pathId,
                      addCourse,
                    );
                    if (result.ok) setAddCourse("");
                    return result;
                  })
                }
              >
                Add node
              </Button>
            </div>
            {data.nodes.length >= 2 ? (
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-40 flex-1">
                  <label
                    htmlFor="prereq-node"
                    className="mb-1 block text-caption text-text-muted"
                  >
                    This node…
                  </label>
                  <Select
                    id="prereq-node"
                    value={fromNode}
                    onChange={(e) => setFromNode(e.target.value)}
                  >
                    <option value="">Choose…</option>
                    {data.nodes.map((n) => (
                      <option key={n.nodeId} value={n.nodeId}>
                        {n.title}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="min-w-40 flex-1">
                  <label
                    htmlFor="prereq-requires"
                    className="mb-1 block text-caption text-text-muted"
                  >
                    …requires
                  </label>
                  <Select
                    id="prereq-requires"
                    value={requiresNode}
                    onChange={(e) => setRequiresNode(e.target.value)}
                  >
                    <option value="">Choose…</option>
                    {data.nodes
                      .filter((n) => n.nodeId !== fromNode)
                      .map((n) => (
                        <option key={n.nodeId} value={n.nodeId}>
                          {n.title}
                        </option>
                      ))}
                  </Select>
                </div>
                <Button
                  variant="secondary"
                  disabled={pending || fromNode === "" || requiresNode === ""}
                  onClick={() =>
                    run(async () => {
                      // client-side cycle preview mirrors the DB trigger
                      const preview = validatePathGraph({
                        nodes: data.nodes.map((n) => ({
                          nodeId: n.nodeId,
                          position: n.position,
                        })),
                        prerequisites: [
                          ...data.prerequisites,
                          { nodeId: fromNode, requiresNodeId: requiresNode },
                        ],
                      });
                      if (
                        preview.cycleNodeIds.length > report.cycleNodeIds.length
                      ) {
                        return {
                          ok: false,
                          message: "That prerequisite would create a cycle.",
                        };
                      }
                      const result = await addPrerequisiteAction(
                        orgSlug,
                        data.pathId,
                        fromNode,
                        requiresNode,
                      );
                      if (result.ok) {
                        setFromNode("");
                        setRequiresNode("");
                      }
                      return result;
                    })
                  }
                >
                  Add prerequisite
                </Button>
              </div>
            ) : null}
            <ActionBanner state={feedback} />
          </div>
        ) : null}
      </Card>
    </div>
  );
}
