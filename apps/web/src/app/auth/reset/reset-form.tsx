"use client";

import { useActionState } from "react";
import { updatePasswordAction } from "@/lib/actions/auth";
import { idle } from "@/lib/actions/types";
import { ActionBanner, Button, Field, Input } from "@/components/ui/primitives";

export function ResetPasswordForm() {
  const [state, action, pending] = useActionState(updatePasswordAction, idle);

  return (
    <form action={action} className="space-y-4" aria-label="Set a new password">
      <Field
        label="New password"
        htmlFor="password"
        error={state.errors?.password}
        hint="At least 12 characters."
      >
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
        />
      </Field>
      <Field
        label="Confirm new password"
        htmlFor="confirm"
        error={state.errors?.confirm}
      >
        <Input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
        />
      </Field>
      <ActionBanner state={state} />
      <Button
        type="submit"
        disabled={pending}
        className="w-full justify-center"
      >
        {pending ? "Saving…" : "Set password"}
      </Button>
    </form>
  );
}
