import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { supabaseServer } from "./supabase/server";

export interface AuthedUser {
  id: string;
  email: string | null;
  /**
   * Supabase user metadata, carrying what someone typed at signup so the
   * organization form can prefill it.
   *
   * UNTRUSTED. The account holder can set these values themselves, so they
   * are display defaults only — never an input to an authorization decision.
   */
  metadata: Record<string, unknown>;
}

/** Authenticated user for this request (validated against Supabase Auth). */
export const getUser = cache(async (): Promise<AuthedUser | null> => {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return {
    id: user.id,
    email: user.email ?? null,
    metadata: (user.user_metadata ?? {}) as Record<string, unknown>,
  };
});

/** Redirects to sign-in when unauthenticated. */
export async function requireUser(): Promise<AuthedUser> {
  const user = await getUser();
  if (!user) redirect("/sign-in");
  return user;
}
