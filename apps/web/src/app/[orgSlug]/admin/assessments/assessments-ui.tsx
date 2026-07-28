"use client";

import { useActionState, useState } from "react";
import { createAssessmentAction } from "@/lib/actions/assessments";
import { idle } from "@/lib/actions/types";
import {
  ActionBanner,
  Button,
  Field,
  Input,
  Select,
} from "@/components/ui/primitives";

export function CreateAssessmentPanel({
  orgSlug,
  termSingular,
}: {
  orgSlug: string;
  termSingular: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(
    createAssessmentAction.bind(null, orgSlug),
    idle,
  );

  return (
    <div className="rounded-md border border-dashed border-border-strong px-4 py-3">
      <Button
        variant="ghost"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {open ? "Close" : `New ${termSingular.toLowerCase()} draft`}
      </Button>
      {open ? (
        <form action={action} className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field
            label="Title"
            htmlFor="assessment-title"
            error={state.errors?.title}
          >
            <Input id="assessment-title" name="title" required />
          </Field>
          <Field label="Type" htmlFor="assessment-type">
            <Select
              id="assessment-type"
              name="assessmentType"
              defaultValue="quiz"
            >
              <option value="knowledge_check">Knowledge check</option>
              <option value="quiz">Quiz</option>
              <option value="exam">Exam</option>
              <option value="assignment">Assignment</option>
              <option value="observation">Observation</option>
              <option value="manual_review">Manual review</option>
            </Select>
          </Field>
          <div className="sm:col-span-2">
            <ActionBanner state={state} />
          </div>
          <div>
            <Button type="submit" disabled={pending}>
              {pending ? "Creating…" : "Create draft"}
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
