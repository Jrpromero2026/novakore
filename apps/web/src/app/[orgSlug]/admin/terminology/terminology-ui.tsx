"use client";

import { useActionState, useState, useTransition } from "react";
import type { TermDisplay } from "@novakore/domain";
import {
  resetTerminologyAction,
  saveTerminologyAction,
} from "@/lib/actions/organization";
import { idle, type ActionState } from "@/lib/actions/types";
import {
  ActionBanner,
  Badge,
  Button,
  Field,
  Input,
} from "@/components/ui/primitives";

export function TermRow({
  orgSlug,
  termKey,
  platformDefault,
  override,
}: {
  orgSlug: string;
  termKey: string;
  platformDefault: TermDisplay;
  override: TermDisplay | null;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(
    saveTerminologyAction.bind(null, orgSlug),
    idle,
  );
  const [resetState, setResetState] = useState<ActionState>(idle);
  const [resetPending, startReset] = useTransition();

  const effective = override ?? platformDefault;

  return (
    <li className="px-5 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-mono text-xs text-text-faint">{termKey}</p>
          <p className="text-sm font-medium text-text">
            {effective.singular} <span className="text-text-faint">/</span>{" "}
            {effective.plural}
            {override ? (
              <span className="ml-2 align-middle">
                <Badge tone="accent">customized</Badge>
              </span>
            ) : null}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            className="text-xs"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
          >
            {open ? "Close" : "Edit"}
          </Button>
          {override ? (
            <Button
              variant="secondary"
              className="text-xs"
              disabled={resetPending}
              onClick={() =>
                startReset(async () =>
                  setResetState(await resetTerminologyAction(orgSlug, termKey)),
                )
              }
            >
              Reset
            </Button>
          ) : null}
        </div>
      </div>

      {open ? (
        <form
          action={action}
          className="mt-3 grid gap-3 rounded-md border border-border bg-surface-sunken p-3 sm:grid-cols-3"
        >
          <input type="hidden" name="term_key" value={termKey} />
          <Field
            label="Singular"
            htmlFor={`singular-${termKey}`}
            error={state.errors?.singular}
          >
            <Input
              id={`singular-${termKey}`}
              name="singular"
              defaultValue={effective.singular}
              required
              maxLength={40}
            />
          </Field>
          <Field
            label="Plural"
            htmlFor={`plural-${termKey}`}
            error={state.errors?.plural}
          >
            <Input
              id={`plural-${termKey}`}
              name="plural"
              defaultValue={effective.plural}
              required
              maxLength={40}
            />
          </Field>
          <Field
            label="Short form"
            htmlFor={`short-${termKey}`}
            error={state.errors?.short_form}
            hint="Optional, for dense UI"
          >
            <Input
              id={`short-${termKey}`}
              name="short_form"
              defaultValue={effective.short ?? ""}
              maxLength={20}
            />
          </Field>
          <div className="sm:col-span-3">
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
        <ActionBanner state={resetState} />
      </div>
    </li>
  );
}
