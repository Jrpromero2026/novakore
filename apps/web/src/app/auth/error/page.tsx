import Link from "next/link";

export default function AuthErrorPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="text-caption font-medium uppercase tracking-[var(--tracking-caps)] text-text-muted">
        NovaKore
      </p>
      <h1 className="text-h1 font-semibold tracking-tight text-text-primary">
        That sign-in link didn&apos;t work
      </h1>
      <p className="max-w-sm text-body-sm text-text-muted">
        The link may have expired or already been used. Request a fresh one from
        the sign-in page.
      </p>
      <Link
        href="/sign-in"
        className="nk-press mt-2 rounded-md bg-accent px-4 py-2 text-body-sm font-medium text-accent-contrast"
      >
        Back to sign-in
      </Link>
    </main>
  );
}
