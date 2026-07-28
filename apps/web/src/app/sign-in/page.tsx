import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage() {
  const user = await getUser();
  if (user) redirect("/select-org");

  return (
    <main className="flex min-h-dvh items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm space-y-8">
        <header className="space-y-1 text-center">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-text-faint">
            NovaKore
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-text">
            Sign in
          </h1>
          <p className="text-sm text-text-muted">
            Learning operating system · organization access is by invitation
          </p>
        </header>
        <SignInForm />
      </div>
    </main>
  );
}
