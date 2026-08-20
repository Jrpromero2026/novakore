"use server";

import { redirect } from "next/navigation";
import { supabaseServer } from "../supabase/server";
import {
  magicLinkSchema,
  newPasswordSchema,
  passwordResetRequestSchema,
  signInSchema,
} from "../validation";
import { fieldErrors, type ActionState } from "./types";

export async function signInAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return fieldErrors(parsed.error);

  const supabase = await supabaseServer();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    // Uniform message: no account-existence oracle.
    return {
      ok: false,
      message: "Sign-in failed. Check your email and password.",
    };
  }
  redirect("/select-org");
}

export async function magicLinkAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = magicLinkSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return fieldErrors(parsed.error);

  const supabase = await supabaseServer();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: {
      // Public organization creation is disabled: magic links may only sign
      // in existing accounts, never create them.
      shouldCreateUser: false,
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/auth/callback`,
    },
  });
  if (error) {
    return {
      ok: false,
      message: "Could not send the sign-in link. Try again shortly.",
    };
  }
  return {
    ok: true,
    message: "If that account exists, a sign-in link is on its way.",
  };
}

/**
 * Send a password-recovery link.
 *
 * Recovery lands on `/auth/callback`, which exchanges the code for a session
 * and then forwards to `/auth/reset` — the only screen that can actually set
 * a new password. Without that `next`, a recovery link merely signs you in
 * and drops you at the org picker with no way to change anything, which is
 * exactly the dead end this flow was missing.
 */
export async function requestPasswordResetAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = passwordResetRequestSchema.safeParse({
    email: formData.get("email"),
  });
  if (!parsed.success) return fieldErrors(parsed.error);

  const supabase = await supabaseServer();
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${site}/auth/callback?next=${encodeURIComponent("/auth/reset")}`,
  });

  // Uniform response whether or not the account exists — same
  // no-account-existence-oracle rule the magic link follows. Errors are
  // deliberately not surfaced.
  return {
    ok: true,
    message: "If that account exists, a reset link is on its way.",
  };
}

/**
 * Set a new password for the session established by a recovery link.
 *
 * Requires an authenticated session: the recovery link creates one before
 * this runs. A visitor who reaches this action without one gets told the
 * link expired rather than a generic failure, because that is almost always
 * what happened.
 */
export async function updatePasswordAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = newPasswordSchema.safeParse({
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) return fieldErrors(parsed.error);

  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false,
      message:
        "That reset link has expired or was already used. Request a new one.",
    };
  }

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });
  if (error) {
    // Surfaced verbatim on purpose: this is where leaked-password protection
    // and length rules report back, and a generic message would leave someone
    // guessing why a valid-looking password was refused.
    return { ok: false, message: error.message };
  }

  redirect("/select-org");
}

export async function signOutAction(): Promise<void> {
  const supabase = await supabaseServer();
  await supabase.auth.signOut();
  redirect("/sign-in");
}
