# Visual Path Builder (Phase 2)

A visual canvas for arranging learning-path nodes and prerequisite
relationships — with the domain model, not the canvas, as the authority
(ADR-020).

## 1. What it shows

- Nodes (course entries) laid out by prerequisite depth (or saved
  coordinates), with published/unpublished and start-node markers.
- Prerequisite edges as arrows; cyclic edges drawn in danger colour.
- Live warnings for cycles, unreachable nodes, and orphans.

## 2. The authoritative alternative

Below the SVG is an ordered, keyboard-accessible list that is the real
editor: add a node, add/remove a prerequisite, remove a node — all via
selects and buttons, with a human-readable prerequisite summary per node
(`describePrerequisites`). Screen readers get the ordered list; the SVG
carries an `aria-label` summary. The canvas is never the only way to edit.

## 3. Graph validation (`validatePathGraph`, pure)

Reports, for authoring feedback only:

- `cycleNodeIds` — iterative-DFS cycle detection; cyclic nodes poison
  reachability.
- `unreachableNodeIds` — nodes whose prerequisite chain can never
  complete.
- `orphanNodeIds` — isolated start nodes in a multi-node graph (a
  warning, not an error).
- `startNodeIds` — nodes with no prerequisites.
- `invalidEdges` — edges referencing unknown nodes.

Adding a prerequisite runs the same algorithm client-side as a pre-check
("that would create a cycle"), but the **database trigger** (1C) is the
authority and re-checks in the same transaction — the UI can be wrong or
skipped and the invariant still holds.

## 4. Layout persistence

`path_layouts` stores `{ nodeId, x, y }` coordinates (bounded schema),
separate from `path_nodes.position` (semantic order). Saving a layout
never changes sequencing; deleting a node cascades its layout entry.
`paths.manage` gates layout writes.

## 5. Phase 2 scope

Only completion prerequisites, required sequencing, and optional branches
— the 1C capability set. The full event-driven rules engine (ADR-009)
remains Phase 3; the builder does not expose arbitrary logic or a generic
JSON editor.
