import Link from "next/link";

export default function AuthErrorPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="text-xs font-medium uppercase tracking-widest text-text-faint">
        NovaKore
      </p>
      <h1 className="text-xl font-semibold tracking-tight text-text">
        That sign-in link didn&apos;t work
      </h1>
      <p className="max-w-sm text-sm text-text-muted">
        The link may have expired or already been used. Request a fresh one from
        the sign-in page.
      </p>
      <Link
        href="/sign-in"
        className="mt-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-contrast"
      >
        Back to sign-in
      </Link>
    </main>
  );
}
