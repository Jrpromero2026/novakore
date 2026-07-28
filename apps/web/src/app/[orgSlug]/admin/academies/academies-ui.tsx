"use client";

import { useActionState, useState, useTransition } from "react";
import {
  createAcademyAction,
  setAcademyStatusAction,
  updateAcademyAction,
} from "@/lib/actions/organization";
import { idle, type ActionState } from "@/lib/actions/types";
import {
  ActionBanner,
  Badge,
  Button,
  Card,
  CardHeader,
  Field,
  Input,
  Textarea,
} from "@/components/ui/primitives";
import { ConfirmButton } from "@/components/ui/feedback";

export function CreateAcademyPanel({
  orgSlug,
  termSingular,
}: {
  orgSlug: string;
  termSingular: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(
    createAcademyAction.bind(null, orgSlug),
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
          <Field label="Name" htmlFor="academy-name" error={state.errors?.name}>
            <Input id="academy-name" name="name" required />
          </Field>
          <Field
            label="Slug"
            htmlFor="academy-slug"
            error={state.errors?.slug}
            hint="Lowercase, URL-safe; unique within the organization."
          >
            <Input
              id="academy-slug"
              name="slug"
              required
              className="font-mono"
            />
          </Field>
          <div className="sm:col-span-2">
            <Field
              label="Description"
              htmlFor="academy-description"
              error={state.errors?.description}
            >
              <Textarea id="academy-description" name="description" rows={2} />
            </Field>
          </div>
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

interface AcademyView {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  status: string;
}

export function AcademyRow({
  orgSlug,
  academy,
  canManage,
}: {
  orgSlug: string;
  academy: AcademyView;
  canManage: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [state, action, pending] = useActionState(
    updateAcademyAction.bind(null, orgSlug, academy.id),
    idle,
  );
  const [statusState, setStatusState] = useState<ActionState>(idle);
  const [statusPending, startStatus] = useTransition();

  const setStatus = (status: "active" | "archived") =>
    startStatus(async () =>
      setStatusState(await setAcademyStatusAction(orgSlug, academy.id, status)),
    );

  return (
    <li className="px-5 py-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-sm font-medium text-text">
            {academy.name}
            <span className="font-mono text-xs text-text-faint">
              /{academy.slug}
            </span>
            {academy.status !== "active" ? (
              <Badge tone="neutral">{academy.status}</Badge>
            ) : null}
          </p>
          {academy.description ? (
            <p className="mt-0.5 line-clamp-2 text-xs text-text-muted">
              {academy.description}
            </p>
          ) : null}
        </div>
        {canManage ? (
          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              className="text-xs"
              onClick={() => setEditing((v) => !v)}
              aria-expanded={editing}
            >
              {editing ? "Close" : "Edit"}
            </Button>
            {academy.status === "archived" ? (
              <Button
                variant="secondary"
                className="text-xs"
                disabled={statusPending}
                onClick={() => setStatus("active")}
              >
                Restore
              </Button>
            ) : (
              <ConfirmButton
                label="Archive"
                confirmLabel="Archive it"
                description="It disappears from active use and can be restored later."
                className="text-xs"
                disabled={statusPending}
                onConfirm={() => setStatus("archived")}
              />
            )}
          </div>
        ) : null}
      </div>

      {editing ? (
        <form
          action={action}
          className="mt-3 grid gap-3 rounded-md border border-border bg-surface-sunken p-3 sm:grid-cols-2"
        >
          <Field
            label="Name"
            htmlFor={`edit-name-${academy.id}`}
            error={state.errors?.name}
          >
            <Input
              id={`edit-name-${academy.id}`}
              name="name"
              defaultValue={academy.name}
              required
            />
          </Field>
          <Field
            label="Slug"
            htmlFor={`edit-slug-${academy.id}`}
            error={state.errors?.slug}
          >
            <Input
              id={`edit-slug-${academy.id}`}
              name="slug"
              defaultValue={academy.slug}
              required
              className="font-mono"
            />
          </Field>
          <div className="sm:col-span-2">
            <Field
              label="Description"
              htmlFor={`edit-description-${academy.id}`}
              error={state.errors?.description}
            >
              <Textarea
                id={`edit-description-${academy.id}`}
                name="description"
                rows={2}
                defaultValue={academy.description ?? ""}
              />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <ActionBanner state={state} />
          </div>
          <div>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </div>
        </form>
      ) : null}

      <div className="mt-2 empty:hidden">
        <ActionBanner state={statusState} />
      </div>
    </li>
  );
}
