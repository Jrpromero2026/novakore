import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { PlatformMark } from "@/components/brand";
import { SignUpForm } from "./sign-up-form";

export const metadata: Metadata = { title: "Create your organization" };

export default async function SignUpPage() {
  // Already signed in: the picker decides where to go, including offering to
  // create an organization if this account has none.
  const user = await getUser();
  if (user) redirect("/select-org");

  return (
    <main className="flex min-h-dvh items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm space-y-8">
        <header className="space-y-3 text-center">
          <div className="flex justify-center">
            <PlatformMark />
          </div>
          <h1 className="text-h1 text-text-primary">
            Create your organization
          </h1>
          <p className="text-body-sm text-text-secondary">
            Your own workspace for courses, assessments and credentials.
          </p>
        </header>

        <SignUpForm />

        <p className="text-center text-body-sm text-text-secondary">
          Already have an account?{" "}
          <Link
            href="/sign-in"
            className="font-medium text-text-primary underline underline-offset-2"
          >
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
