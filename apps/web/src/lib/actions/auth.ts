"use server";

import { redirect } from "next/navigation";
import { supabaseServer } from "../supabase/server";
import { siteLink } from "../site-url";
import {
  createOrganizationSchema,
  magicLinkSchema,
  newPasswordSchema,
  passwordResetRequestSchema,
  signInSchema,
  signUpSchema,
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

/**
 * Self-serve signup.
 *
 * The organization is NOT created here. Supabase issues no session until the
 * address is confirmed, so at this moment there is no authenticated caller to
 * own anything — and creating tenants for unverified addresses is how a
 * tenant table fills with junk. The answers ride along in user metadata and
 * the organization is created on first sign-in, from /select-org.
 */
export async function signUpAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = signUpSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    organizationName: formData.get("organizationName"),
    useCase: formData.get("useCase"),
    useCaseDetail: formData.get("useCaseDetail") || undefined,
  });
  if (!parsed.success) return fieldErrors(parsed.error);

  const supabase = await supabaseServer();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: siteLink("/auth/callback"),
      data: {
        organization_name: parsed.data.organizationName,
        use_case: parsed.data.useCase,
        use_case_detail: parsed.data.useCaseDetail ?? null,
      },
    },
  });

  if (error) {
    return {
      ok: false,
      message:
        error.status === 429
          ? "Too many attempts. Try again in a few minutes."
          : "Could not create the account. Check the address and try again.",
    };
  }

  // Deliberately the same wording whether or not the address was already
  // registered: a distinct message here would confirm who has an account.
  return {
    ok: true,
    message:
      "Check your email to confirm the address. Your workspace is created when you first sign in.",
  };
}

/**
 * Create the organization for the signed-in caller.
 *
 * Runs after confirmation, from /select-org, for an account that belongs to
 * nothing yet. The database function is what enforces the rules — it can only
 * ever create an organization owned by the caller, and it is rate limited.
 */
export async function createOrganizationAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = createOrganizationSchema.safeParse({
    organizationName: formData.get("organizationName"),
    useCase: formData.get("useCase"),
    useCaseDetail: formData.get("useCaseDetail") || undefined,
  });
  if (!parsed.success) return fieldErrors(parsed.error);

  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc("create_own_organization", {
    p_name: parsed.data.organizationName,
    p_use_case: parsed.data.useCase,
    ...(parsed.data.useCaseDetail
      ? { p_use_case_detail: parsed.data.useCaseDetail }
      : {}),
  });

  if (error) {
    return {
      ok: false,
      message:
        error.code === "53400"
          ? "That is a lot of organizations in one hour. Try again shortly."
          : "Could not create the organization. Please try again.",
    };
  }

  const created = data?.[0];
  if (!created) {
    return { ok: false, message: "Could not create the organization." };
  }
  redirect(`/${created.slug}/admin`);
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
      emailRedirectTo: siteLink("/auth/callback"),
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
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: siteLink(
      `/auth/callback?next=${encodeURIComponent("/auth/reset")}`,
    ),
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
