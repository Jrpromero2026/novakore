"use client";

import { useActionState, useState } from "react";
import {
  magicLinkAction,
  requestPasswordResetAction,
  signInAction,
} from "@/lib/actions/auth";
import { idle } from "@/lib/actions/types";
import {
  ActionBanner,
  Button,
  Field,
  Input,
  cx,
} from "@/components/ui/primitives";

type Mode = "password" | "magic-link" | "reset";

export function SignInForm() {
  const [mode, setMode] = useState<Mode>("password");
  const [passwordState, passwordAction, passwordPending] = useActionState(
    signInAction,
    idle,
  );
  const [magicState, magicAction, magicPending] = useActionState(
    magicLinkAction,
    idle,
  );
  const [resetState, resetAction, resetPending] = useActionState(
    requestPasswordResetAction,
    idle,
  );

  return (
    <div className="space-y-5">
      <div
        role="tablist"
        aria-label="Sign-in method"
        className="grid grid-cols-2 gap-1 rounded-md bg-surface-sunken p-1"
      >
        {(
          [
            ["password", "Password"],
            ["magic-link", "Magic link"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            role="tab"
            aria-selected={
              mode === value || (mode === "reset" && value === "password")
            }
            onClick={() => setMode(value)}
            className={cx(
              "rounded-[5px] px-3 py-1.5 text-sm font-medium transition-colors",
              mode === value
                ? "bg-surface text-text shadow-raised"
                : "text-text-muted hover:text-text",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === "password" ? (
        <form
          action={passwordAction}
          className="space-y-4"
          aria-label="Sign in with password"
        >
          <Field
            label="Email"
            htmlFor="email"
            error={passwordState.errors?.email}
          >
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
            />
          </Field>
          <Field
            label="Password"
            htmlFor="password"
            error={passwordState.errors?.password}
          >
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </Field>
          <ActionBanner state={passwordState} />
          <Button
            type="submit"
            disabled={passwordPending}
            className="w-full justify-center"
          >
            {passwordPending ? "Signing in…" : "Sign in"}
          </Button>
          <button
            type="button"
            onClick={() => setMode("reset")}
            className="w-full text-center text-caption text-text-muted underline underline-offset-2 hover:text-text"
          >
            Forgot your password?
          </button>
        </form>
      ) : mode === "magic-link" ? (
        <form
          action={magicAction}
          className="space-y-4"
          aria-label="Request a magic link"
        >
          <Field
            label="Email"
            htmlFor="magic-email"
            error={magicState.errors?.email}
            hint="We'll email you a one-time sign-in link."
          >
            <Input
              id="magic-email"
              name="email"
              type="email"
              autoComplete="email"
              required
            />
          </Field>
          <ActionBanner state={magicState} />
          <Button
            type="submit"
            disabled={magicPending}
            className="w-full justify-center"
          >
            {magicPending ? "Sending…" : "Email me a sign-in link"}
          </Button>
        </form>
      ) : null}

      {mode === "reset" ? (
        <form
          action={resetAction}
          className="space-y-4"
          aria-label="Request a password reset"
        >
          <Field
            label="Email"
            htmlFor="reset-email"
            error={resetState.errors?.email}
            hint="We'll email you a link to set a new password."
          >
            <Input
              id="reset-email"
              name="email"
              type="email"
              autoComplete="email"
              required
            />
          </Field>
          <ActionBanner state={resetState} />
          <Button
            type="submit"
            disabled={resetPending}
            className="w-full justify-center"
          >
            {resetPending ? "Sending…" : "Email me a reset link"}
          </Button>
          <button
            type="button"
            onClick={() => setMode("password")}
            className="w-full text-center text-caption text-text-muted underline underline-offset-2 hover:text-text"
          >
            Back to sign in
          </button>
        </form>
      ) : null}
    </div>
  );
}
