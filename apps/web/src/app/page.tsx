import Link from "next/link";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { NovaKoreMark, PlatformMark } from "@/components/brand";

/**
 * NovaKore platform landing (platform identity — never tenant-themed).
 * Authenticated users skip straight to their organizations; visitors get
 * the brand surface. Copy states only what the platform actually does.
 */
export default async function HomePage() {
  const user = await getUser();
  if (user) redirect("/select-org");

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-[var(--layout-header)] items-center justify-between px-6 sm:px-10">
        <PlatformMark />
        <Link
          href="/sign-in"
          className="rounded-md border border-border-strong px-3.5 py-1.5 text-body-sm font-medium text-text-primary transition-colors duration-[var(--motion-fast)] hover:bg-surface-interactive"
        >
          Sign in
        </Link>
      </header>

      <main className="flex flex-1 flex-col">
        <section className="mx-auto flex w-full max-w-[var(--layout-page-max)] flex-1 flex-col items-center justify-center px-6 py-24 text-center sm:px-10">
          <NovaKoreMark size={72} className="mb-10" />
          <p
            className="text-caption font-medium uppercase text-text-muted"
            style={{ letterSpacing: "0.32em" }}
          >
            Knowledge at the{" "}
            <span
              className="bg-clip-text font-semibold text-transparent"
              style={{ backgroundImage: "var(--brand-gradient)" }}
            >
              Core
            </span>
          </p>
          <h1 className="mt-6 max-w-3xl text-balance text-4xl font-semibold leading-[1.1] tracking-tight text-text-primary sm:text-5xl">
            Learning infrastructure for professional organizations
          </h1>
          <p className="mt-6 max-w-xl text-pretty text-base leading-relaxed text-text-secondary">
            NovaKore is the knowledge infrastructure layer beneath academies,
            journeys, and credentials — modular, governed, and white-labeled for
            every organization it powers.
          </p>
          <div className="mt-10 flex items-center gap-4">
            <Link
              href="/sign-in"
              className="rounded-md bg-accent px-5 py-2.5 text-body-sm font-medium text-accent-contrast transition-colors duration-[var(--motion-fast)] hover:bg-accent-hover"
            >
              Sign in
            </Link>
            <span className="text-body-sm text-text-muted">
              Organization access is by invitation
            </span>
          </div>
        </section>

        <section className="border-t border-border-subtle">
          <div className="mx-auto grid w-full max-w-[var(--layout-page-max)] gap-10 px-6 py-16 sm:grid-cols-3 sm:px-10">
            <div>
              <h2 className="text-title text-text-primary">
                Knowledge systems
              </h2>
              <p className="mt-2 text-body-sm leading-relaxed text-text-secondary">
                Academies, journeys, and programs composed from versioned,
                reusable content — published deliberately, never ad hoc.
              </p>
            </div>
            <div>
              <h2 className="text-title text-text-primary">
                Assessment &amp; credentials
              </h2>
              <p className="mt-2 text-body-sm leading-relaxed text-text-secondary">
                Governed evaluation and review workflows that end in verifiable
                credentials, each with a public verification record.
              </p>
            </div>
            <div>
              <h2 className="text-title text-text-primary">
                Organization-grade governance
              </h2>
              <p className="mt-2 text-body-sm leading-relaxed text-text-secondary">
                Granular permissions, tenant isolation, and white-label theming
                — every organization runs on its own terms.
              </p>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border-subtle">
        <div className="mx-auto flex w-full max-w-[var(--layout-page-max)] items-center justify-between px-6 py-6 sm:px-10">
          <p className="text-caption text-text-muted">
            NovaKore — Knowledge at the Core
          </p>
          <Link
            href="/sign-in"
            className="text-caption text-text-muted transition-colors duration-[var(--motion-fast)] hover:text-text-primary"
          >
            Sign in
          </Link>
        </div>
      </footer>
    </div>
  );
}
