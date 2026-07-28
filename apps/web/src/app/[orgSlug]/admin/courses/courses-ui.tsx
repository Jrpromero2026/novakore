"use client";

import { useActionState, useState } from "react";
import { createCourseAction } from "@/lib/actions/learning";
import { idle } from "@/lib/actions/types";
import {
  ActionBanner,
  Button,
  Card,
  CardHeader,
  Field,
  Input,
} from "@/components/ui/primitives";

export function CreateCoursePanel({
  orgSlug,
  termSingular,
}: {
  orgSlug: string;
  termSingular: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(
    createCourseAction.bind(null, orgSlug),
    idle,
  );
  return (
    <Card>
      <CardHeader
        title={`New ${termSingular.toLowerCase()} draft`}
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
            htmlFor="course-title"
            error={state.errors?.title}
          >
            <Input id="course-title" name="title" required />
          </Field>
          <Field label="Slug" htmlFor="course-slug" error={state.errors?.slug}>
            <Input
              id="course-slug"
              name="slug"
              required
              className="font-mono"
            />
          </Field>
          <div className="sm:col-span-2">
            <ActionBanner state={{ ...state, warnings: undefined }} />
          </div>
          <div>
            <Button type="submit" disabled={pending}>
              {pending ? "Creating…" : "Create draft"}
            </Button>
          </div>
        </form>
      ) : null}
    </Card>
  );
}
