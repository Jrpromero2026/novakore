"use client";

import { useActionState, useState } from "react";
import { signUpAction } from "@/lib/actions/auth";
import { idle } from "@/lib/actions/types";
import { USE_CASES } from "@/lib/validation";
import {
  ActionBanner,
  Button,
  Field,
  Input,
  Select,
} from "@/components/ui/primitives";

export function SignUpForm() {
  const [state, action, pending] = useActionState(signUpAction, idle);
  const [useCase, setUseCase] = useState("");

  // Once the confirmation email is on its way there is nothing left to do on
  // this page, and leaving the form visible invites a second submission that
  // would only produce a second email.
  if (state.ok) {
    return <ActionBanner state={state} />;
  }

  return (
    <form action={action} className="space-y-4">
      <Field
        label="Organization name"
        htmlFor="signup-org"
        error={state.errors?.organizationName}
        hint="This names your workspace. You can change it later."
      >
        <Input
          id="signup-org"
          name="organizationName"
          required
          autoComplete="organization"
          placeholder="G3 Performance"
        />
      </Field>

      <Field
        label="What are you primarily here to do?"
        htmlFor="signup-use-case"
        error={state.errors?.useCase}
      >
        <Select
          id="signup-use-case"
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

      {/* Only asked when the list did not fit, so nobody types into a box
          they had no reason to open. */}
      {useCase === "other" ? (
        <Field
          label="Tell us a little more"
          htmlFor="signup-use-case-detail"
          error={state.errors?.useCaseDetail}
        >
          <Input
            id="signup-use-case-detail"
            name="useCaseDetail"
            maxLength={280}
            placeholder="What are you building?"
          />
        </Field>
      ) : null}

      <Field
        label="Work email"
        htmlFor="signup-email"
        error={state.errors?.email}
      >
        <Input
          id="signup-email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@yourorganization.com"
        />
      </Field>

      <Field
        label="Password"
        htmlFor="signup-password"
        error={state.errors?.password}
        hint="At least 12 characters."
      >
        <Input
          id="signup-password"
          name="password"
          type="password"
          required
          autoComplete="new-password"
          minLength={12}
        />
      </Field>

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Creating your account…" : "Create account"}
      </Button>

      <ActionBanner state={state} />
    </form>
  );
}
