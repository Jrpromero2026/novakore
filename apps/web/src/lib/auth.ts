import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { supabaseServer } from "./supabase/server";

export interface AuthedUser {
  id: string;
  email: string | null;
}

/** Authenticated user for this request (validated against Supabase Auth). */
export const getUser = cache(async (): Promise<AuthedUser | null> => {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return { id: user.id, email: user.email ?? null };
});

/** Redirects to sign-in when unauthenticated. */
export async function requireUser(): Promise<AuthedUser> {
  const user = await getUser();
  if (!user) redirect("/sign-in");
  return user;
}
