"use client";

import { useActionState, useState, useTransition } from "react";
import {
  addPathNodeAction,
  addPrerequisiteAction,
  createLearningPathAction,
  createLearningSystemAction,
  removePrerequisiteAction,
  swapPositionsAction,
} from "@/lib/actions/learning";
import { idle, type ActionState } from "@/lib/actions/types";
import {
  ActionBanner,
  Badge,
  Button,
  Card,
  CardHeader,
  Field,
  Input,
  Select,
} from "@/components/ui/primitives";

export function CreateSystemPanel({
  orgSlug,
  termSingular,
}: {
  orgSlug: string;
  termSingular: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(
    createLearningSystemAction.bind(null, orgSlug),
    idle,
  );
  return (
    <Card>
      <CardHeader
        title={`New ${termSingular.toLowerCase()}`}
        actions={
          <Button
            variant="secondary"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
          >
            {open ? "Close" : `Create ${termSingular.toLowerCase()}`}
          </Button>
        }
      />
      {open ? (
        <form action={action} className="grid gap-3 px-5 py-4 sm:grid-cols-2">
          <Field
            label="Title"
            htmlFor="system-title"
            error={state.errors?.title}
          >
            <Input id="system-title" name="title" required />
          </Field>
          <Field label="Slug" htmlFor="system-slug" error={state.errors?.slug}>
            <Input
              id="system-slug"
              name="slug"
              required
              className="font-mono"
            />
          </Field>
          <div className="sm:col-span-2">
            <ActionBanner state={state} />
          </div>
          <div>
            <Button type="submit" disabled={pending}>
              {pending ? "Creating…" : "Create"}
            </Button>
          </div>
        </form>
      ) : null}
    </Card>
  );
}

interface NodeRow {
  id: string;
  path_id: string;
  course_id: string;
  position: string;
}
interface PrereqRow {
  id: string;
  node_id: string;
  requires_node_id: string;
}
interface CourseOption {
  id: string;
  title: string;
  published: boolean;
}

export function PathCard({
  orgSlug,
  path,
  nodes,
  prerequisites,
  courses,
  pathTerm,
  courseTerm,
}: {
  orgSlug: string;
  path: { id: string; title: string; slug: string; status: string };
  nodes: NodeRow[];
  prerequisites: PrereqRow[];
  courses: CourseOption[];
  pathTerm: string;
  courseTerm: string;
}) {
  const [feedback, setFeedback] = useState<ActionState>(idle);
  const [pending, startTransition] = useTransition();
  const [addCourseId, setAddCourseId] = useState("");
  const [prereqNode, setPrereqNode] = useState("");
  const [prereqRequires, setPrereqRequires] = useState("");

  const run = (fn: () => Promise<ActionState>) =>
    startTransition(async () => setFeedback(await fn()));

  const courseTitle = (id: string) =>
    courses.find((c) => c.id === id)?.title ?? courseTerm;
  const nodeTitle = (nodeId: string) => {
    const node = nodes.find((n) => n.id === nodeId);
    return node ? courseTitle(node.course_id) : "?";
  };
  const availableCourses = courses.filter(
    (c) => c.published && !nodes.some((n) => n.course_id === c.id),
  );
  const sorted = [...nodes].sort((a, b) => (a.position < b.position ? -1 : 1));

  return (
    <div className="rounded-md border border-border-default">
      <div className="flex items-center justify-between border-b border-border-subtle px-4 py-2.5">
        <p className="text-title text-text-primary">
          {path.title}{" "}
          <span className="font-mono text-caption text-text-faint">
            /{path.slug}
          </span>
        </p>
        <Badge tone={path.status === "active" ? "positive" : "neutral"}>
          {path.status}
        </Badge>
      </div>

      <ol
        className="divide-y divide-border-subtle"
        aria-label={`${pathTerm} sequence`}
      >
        {sorted.map((node, index) => {
          const requirements = prerequisites.filter(
            (p) => p.node_id === node.id,
          );
          return (
            <li
              key={node.id}
              className="flex flex-wrap items-center gap-2 px-4 py-2.5"
            >
              <span className="text-caption tabular-nums text-text-muted">
                {index + 1}.
              </span>
              <span className="flex-1 text-body-sm text-text-primary">
                {courseTitle(node.course_id)}
              </span>
              {requirements.map((p) => (
                <span
                  key={p.id}
                  className="inline-flex items-center gap-1 rounded-full bg-surface-interactive px-2 py-0.5 text-caption text-text-secondary"
                >
                  requires {nodeTitle(p.requires_node_id)}
                  <button
                    type="button"
                    aria-label={`Remove prerequisite ${nodeTitle(p.requires_node_id)}`}
                    disabled={pending}
                    onClick={() =>
                      run(() => removePrerequisiteAction(orgSlug, p.id))
                    }
                    className="text-text-faint hover:text-danger"
                  >
                    ×
                  </button>
                </span>
              ))}
              <span className="flex gap-1">
                <Button
                  variant="ghost"
                  className="px-2 text-xs"
                  aria-label={`Move ${courseTitle(node.course_id)} up`}
                  disabled={pending || index === 0}
                  onClick={() =>
                    run(() =>
                      swapPositionsAction(
                        orgSlug,
                        "path_nodes",
                        node.id,
                        sorted[index - 1]!.id,
                      ),
                    )
                  }
                >
                  ↑
                </Button>
                <Button
                  variant="ghost"
                  className="px-2 text-xs"
                  aria-label={`Move ${courseTitle(node.course_id)} down`}
                  disabled={pending || index === sorted.length - 1}
                  onClick={() =>
                    run(() =>
                      swapPositionsAction(
                        orgSlug,
                        "path_nodes",
                        node.id,
                        sorted[index + 1]!.id,
                      ),
                    )
                  }
                >
                  ↓
                </Button>
              </span>
            </li>
          );
        })}
      </ol>

      <div className="flex flex-wrap items-end gap-3 border-t border-border-subtle px-4 py-3">
        <div className="min-w-48">
          <label
            htmlFor={`add-course-${path.id}`}
            className="mb-1 block text-label text-text-secondary"
          >
            Add {courseTerm.toLowerCase()} (published only)
          </label>
          <Select
            id={`add-course-${path.id}`}
            value={addCourseId}
            onChange={(e) => setAddCourseId(e.target.value)}
          >
            <option value="">Choose…</option>
            {availableCourses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </Select>
        </div>
        <Button
          variant="secondary"
          disabled={pending || !addCourseId}
          onClick={() =>
            run(async () => {
              const result = await addPathNodeAction(
                orgSlug,
                path.id,
                addCourseId,
              );
              setAddCourseId("");
              return result;
            })
          }
        >
          Add
        </Button>

        {nodes.length >= 2 ? (
          <>
            <div className="min-w-40">
              <label
                htmlFor={`pr-node-${path.id}`}
                className="mb-1 block text-label text-text-secondary"
              >
                Prerequisite: this…
              </label>
              <Select
                id={`pr-node-${path.id}`}
                value={prereqNode}
                onChange={(e) => setPrereqNode(e.target.value)}
              >
                <option value="">Choose…</option>
                {sorted.map((n) => (
                  <option key={n.id} value={n.id}>
                    {courseTitle(n.course_id)}
                  </option>
                ))}
              </Select>
            </div>
            <div className="min-w-40">
              <label
                htmlFor={`pr-req-${path.id}`}
                className="mb-1 block text-label text-text-secondary"
              >
                …requires
              </label>
              <Select
                id={`pr-req-${path.id}`}
                value={prereqRequires}
                onChange={(e) => setPrereqRequires(e.target.value)}
              >
                <option value="">Choose…</option>
                {sorted
                  .filter((n) => n.id !== prereqNode)
                  .map((n) => (
                    <option key={n.id} value={n.id}>
                      {courseTitle(n.course_id)}
                    </option>
                  ))}
              </Select>
            </div>
            <Button
              variant="secondary"
              disabled={pending || !prereqNode || !prereqRequires}
              onClick={() =>
                run(async () => {
                  const result = await addPrerequisiteAction(
                    orgSlug,
                    path.id,
                    prereqNode,
                    prereqRequires,
                  );
                  setPrereqNode("");
                  setPrereqRequires("");
                  return result;
                })
              }
            >
              Add prerequisite
            </Button>
          </>
        ) : null}
      </div>
      <div className="px-4 pb-3 empty:hidden">
        <ActionBanner state={feedback} />
      </div>
    </div>
  );
}

// Must be a module-level export: statics attached to a client component do
// not survive the server→client reference boundary.
export function CreatePathPanel({
  orgSlug,
  learningSystemId,
  pathTerm,
}: {
  orgSlug: string;
  learningSystemId: string;
  pathTerm: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(
    createLearningPathAction.bind(null, orgSlug, learningSystemId),
    idle,
  );
  return (
    <div className="rounded-md border border-dashed border-border-strong px-4 py-3">
      <Button
        variant="ghost"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {open ? "Close" : `New ${pathTerm.toLowerCase()}`}
      </Button>
      {open ? (
        <form action={action} className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field
            label="Title"
            htmlFor={`path-title-${learningSystemId}`}
            error={state.errors?.title}
          >
            <Input
              id={`path-title-${learningSystemId}`}
              name="title"
              required
            />
          </Field>
          <Field
            label="Slug"
            htmlFor={`path-slug-${learningSystemId}`}
            error={state.errors?.slug}
          >
            <Input
              id={`path-slug-${learningSystemId}`}
              name="slug"
              required
              className="font-mono"
            />
          </Field>
          <div className="sm:col-span-2">
            <ActionBanner state={state} />
          </div>
          <div>
            <Button type="submit" disabled={pending}>
              {pending ? "Creating…" : "Create"}
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
