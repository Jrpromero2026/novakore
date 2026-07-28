"use server";

import { redirect } from "next/navigation";
import { supabaseServer } from "../supabase/server";
import { magicLinkSchema, signInSchema } from "../validation";
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

export async function signOutAction(): Promise<void> {
  const supabase = await supabaseServer();
  await supabase.auth.signOut();
  redirect("/sign-in");
}
