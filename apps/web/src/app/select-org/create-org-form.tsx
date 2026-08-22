"use client";

import { useActionState, useState } from "react";
import { createOrganizationAction } from "@/lib/actions/auth";
import { idle } from "@/lib/actions/types";
import { USE_CASES } from "@/lib/validation";
import {
  ActionBanner,
  Button,
  Field,
  Input,
  Select,
} from "@/components/ui/primitives";

/**
 * The second half of signup, run once the address is confirmed.
 *
 * The answers given at signup arrive as defaults rather than as a silent
 * automatic creation: the person is about to own this workspace, and the last
 * chance to correct its name should be in front of them, not behind them.
 */
export function CreateOrganizationForm({
  defaultName,
  defaultUseCase,
  defaultUseCaseDetail,
}: {
  defaultName: string;
  defaultUseCase: string;
  defaultUseCaseDetail: string;
}) {
  const [state, action, pending] = useActionState(
    createOrganizationAction,
    idle,
  );
  const [useCase, setUseCase] = useState(defaultUseCase);

  return (
    <form action={action} className="space-y-4">
      <Field
        label="Organization name"
        htmlFor="create-org-name"
        error={state.errors?.organizationName}
        hint="Your workspace address is built from this."
      >
        <Input
          id="create-org-name"
          name="organizationName"
          required
          defaultValue={defaultName}
          autoComplete="organization"
          placeholder="G3 Performance"
        />
      </Field>

      <Field
        label="What are you primarily here to do?"
        htmlFor="create-org-use-case"
        error={state.errors?.useCase}
      >
        <Select
          id="create-org-use-case"
          name="useCase"
          required
          value={useCase}
          onChange={(e) => setUseCase(e.target.value)}
        >
          <option value="" disabled>
            Choose one
          </option>
          {USE_CASES.map((u) => (
            <option key={u.value} value={u.value}>
              {u.label}
            </option>
          ))}
        </Select>
      </Field>

      {useCase === "other" ? (
        <Field
          label="Tell us a little more"
          htmlFor="create-org-detail"
          error={state.errors?.useCaseDetail}
        >
          <Input
            id="create-org-detail"
            name="useCaseDetail"
            maxLength={280}
            defaultValue={defaultUseCaseDetail}
            placeholder="What are you building?"
          />
        </Field>
      ) : null}

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Creating your workspace…" : "Create organization"}
      </Button>

      <ActionBanner state={state} />
    </form>
  );
}
