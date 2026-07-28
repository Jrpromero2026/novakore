"use client";

import { useActionState, useMemo, useState, useTransition } from "react";
import {
  createRoleAction,
  setRolePermissionAction,
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
  cx,
} from "@/components/ui/primitives";

export function CreateRolePanel({ orgSlug }: { orgSlug: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(
    createRoleAction.bind(null, orgSlug),
    idle,
  );

  return (
    <Card>
      <CardHeader
        title="Custom roles"
        description="Create a role, then grant it permissions below."
        actions={
          <Button
            variant="secondary"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
          >
            {open ? "Close" : "New role"}
          </Button>
        }
      />
      {open ? (
        <form action={action} className="grid gap-3 px-5 py-4 sm:grid-cols-2">
          <Field
            label="Key"
            htmlFor="role-key"
            error={state.errors?.key}
            hint="Stable identifier, e.g. content_lead"
          >
            <Input id="role-key" name="key" required />
          </Field>
          <Field label="Name" htmlFor="role-name" error={state.errors?.name}>
            <Input id="role-name" name="name" required />
          </Field>
          <div className="sm:col-span-2">
            <Field
              label="Description"
              htmlFor="role-description"
              error={state.errors?.description}
            >
              <Textarea id="role-description" name="description" rows={2} />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <ActionBanner state={state} />
          </div>
          <div>
            <Button type="submit" disabled={pending}>
              {pending ? "Creating…" : "Create role"}
            </Button>
          </div>
        </form>
      ) : null}
    </Card>
  );
}

interface RoleView {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  granted: string[];
}

export function RoleEditor({
  orgSlug,
  roles,
  permissions,
}: {
  orgSlug: string;
  roles: RoleView[];
  permissions: { code: string; description: string; category: string }[];
}) {
  const [selectedId, setSelectedId] = useState(roles[0]?.id ?? "");
  const [feedback, setFeedback] = useState<ActionState>(idle);
  const [pending, startTransition] = useTransition();
  const selected = roles.find((r) => r.id === selectedId);

  const byCategory = useMemo(() => {
    const map = new Map<string, typeof permissions>();
    for (const p of permissions) {
      const list = map.get(p.category) ?? [];
      list.push(p);
      map.set(p.category, list);
    }
    return [...map.entries()];
  }, [permissions]);

  const toggle = (code: string, granted: boolean) =>
    startTransition(async () => {
      setFeedback(
        await setRolePermissionAction(orgSlug, selectedId, code, granted),
      );
    });

  return (
    <div className="flex flex-col md:flex-row">
      <ul
        className="flex gap-1 overflow-x-auto border-b border-border p-3 md:w-56 md:shrink-0 md:flex-col md:border-b-0 md:border-r"
        aria-label="Roles"
      >
        {roles.map((r) => (
          <li key={r.id}>
            <button
              type="button"
              onClick={() => {
                setSelectedId(r.id);
                setFeedback(idle);
              }}
              aria-pressed={r.id === selectedId}
              className={cx(
                "flex w-full items-center justify-between gap-2 whitespace-nowrap rounded-md px-3 py-2 text-left text-sm",
                r.id === selectedId
                  ? "bg-accent-soft font-medium text-accent"
                  : "text-text-muted hover:bg-surface-sunken hover:text-text",
              )}
            >
              {r.name}
              {r.isSystem ? <Badge>system</Badge> : null}
            </button>
          </li>
        ))}
      </ul>

      {selected ? (
        <div className="flex-1 space-y-4 p-5">
          <div>
            <p className="text-sm font-medium text-text">
              {selected.name}{" "}
              <span className="text-xs text-text-faint">({selected.key})</span>
            </p>
            {selected.description ? (
              <p className="mt-0.5 text-xs text-text-muted">
                {selected.description}
              </p>
            ) : null}
            {selected.isSystem ? (
              <p className="mt-1.5 text-xs text-warning">
                System role — its permissions are fixed by the platform.
              </p>
            ) : null}
          </div>

          <ActionBanner state={feedback} />

          <div className="space-y-4">
            {byCategory.map(([category, perms]) => (
              <fieldset key={category}>
                <legend className="mb-1.5 text-[11px] font-semibold uppercase tracking-widest text-text-faint">
                  {category}
                </legend>
                <div className="grid gap-1 sm:grid-cols-2">
                  {perms.map((p) => {
                    const granted = selected.granted.includes(p.code);
                    return (
                      <label
                        key={p.code}
                        className={cx(
                          "flex cursor-pointer items-start gap-2.5 rounded-md border px-3 py-2",
                          granted
                            ? "border-accent/40 bg-accent-soft"
                            : "border-border",
                          selected.isSystem && "cursor-not-allowed opacity-70",
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={granted}
                          disabled={selected.isSystem || pending}
                          onChange={(e) => toggle(p.code, e.target.checked)}
                          className="mt-0.5 accent-[var(--accent)]"
                        />
                        <span>
                          <span className="block font-mono text-xs font-medium text-text">
                            {p.code}
                          </span>
                          <span className="block text-xs text-text-muted">
                            {p.description}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
