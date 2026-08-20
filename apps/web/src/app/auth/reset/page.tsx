import type { Metadata } from "next";
import Link from "next/link";
import { getUser } from "@/lib/auth";
import { PlatformMark } from "@/components/brand";
import { ResetPasswordForm } from "./reset-form";

export const metadata: Metadata = { title: "Set a new password" };

/**
 * The screen a recovery link lands on.
 *
 * The link itself establishes a session via /auth/callback; this page only
 * has to let someone set a password. If the session is missing the link has
 * expired or been used, and saying so plainly beats an empty form that fails
 * on submit.
 */
export default async function ResetPasswordPage() {
  const user = await getUser();

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-6 py-12">
      <div className="space-y-2">
        <PlatformMark />
        <h1 className="text-h1 text-text-primary">Set a new password</h1>
        {user?.email ? (
          <p className="text-body-sm text-text-secondary">
            You are resetting the password for{" "}
            <span className="font-medium text-text">{user.email}</span>.
          </p>
        ) : null}
      </div>

      {user ? (
        <ResetPasswordForm />
      ) : (
        <div className="space-y-4">
          <p className="text-body-sm text-text-secondary">
            This reset link has expired or has already been used. Request a new
            one and it will arrive within a few minutes.
          </p>
          <Link
            href="/sign-in"
            className="nk-press inline-flex rounded-md bg-accent px-3.5 py-2 text-sm font-medium text-accent-contrast hover:bg-accent-hover"
          >
            Back to sign in
          </Link>
        </div>
      )}
    </main>
  );
}
