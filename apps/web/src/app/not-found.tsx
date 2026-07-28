import Link from "next/link";
import { PlatformMark } from "@/components/brand";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
      <PlatformMark />
      <p
        className="text-caption uppercase text-text-muted"
        style={{ letterSpacing: "var(--tracking-caps)" }}
      >
        404
      </p>
      <h1 className="text-h2 text-text-primary">
        This page doesn&apos;t exist
      </h1>
      <p className="max-w-sm text-body-sm text-text-secondary">
        The address may be wrong, or you may not have access to what lives here.
      </p>
      <Link
        href="/"
        className="mt-2 rounded-md border border-border-strong px-4 py-2 text-body-sm font-medium text-text-primary transition-colors duration-[var(--motion-fast)] hover:bg-surface-interactive"
      >
        Go to your workspace
      </Link>
    </main>
  );
}
