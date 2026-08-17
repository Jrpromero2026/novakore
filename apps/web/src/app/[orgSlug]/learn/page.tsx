import type { Metadata } from "next";
import Link from "next/link";
import { can, requireOrgContext } from "@/lib/org-context";
import { requireUser } from "@/lib/auth";
import { tourTarget, TOUR_TARGETS } from "@/lib/onboarding/targets";
import { OnboardingPageMarker } from "@/components/onboarding/page-marker";
import { getMyEnrollments } from "@/lib/data/learning";
import { getMyCredentials } from "@/lib/data/assessments";
import { getTerminology } from "@/lib/terminology";
import { Badge, Card, EmptyState } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "My learning" };

export default async function LearnerHomePage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const ctx = await requireOrgContext(orgSlug);
  const user = await requireUser();
  const { term } = await getTerminology(ctx.organization.id);
  const [enrollments, credentials] = await Promise.all([
    getMyEnrollments(ctx.organization.id, user.id),
    getMyCredentials(ctx.organization.id, user.id),
  ]);

  const inProgress = enrollments.filter((e) => e.status !== "completed");
  // "Continue" = the active enrollment with the most momentum, else the first.
  const resume =
    [...inProgress].sort(
      (a, b) => b.completedLessons - a.completedLessons,
    )[0] ?? null;
  const activeCredentials = credentials.filter((c) => c.status === "active");

  const kindLabel = (t: "learning_path" | "course") =>
    t === "learning_path"
      ? term("learning_path").singular
      : term("course").singular;

  return (
    <div
      className="space-y-8"
      {...tourTarget(TOUR_TARGETS.learnerPreviewSurface)}
    >
      {/* Only content authors/admins previewing the learner surface complete
          the checklist step — a real learner's visit never counts. */}
      {can(ctx, "content.view_draft") ? (
        <OnboardingPageMarker
          orgSlug={orgSlug}
          event="onboarding.preview.opened"
        />
      ) : null}
      <header className="space-y-1">
        <p
          className="text-caption uppercase text-text-muted"
          style={{ letterSpacing: "var(--tracking-caps)" }}
        >
          Academy
        </p>
        <h1 className="text-h1 text-text-primary">Welcome back</h1>
        <p className="text-body-sm text-text-secondary">
          Pick up where you left off, or explore what&apos;s next.
        </p>
      </header>

      {resume ? (
        <Card className="overflow-hidden">
          <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 space-y-1">
              <p
                className="text-caption uppercase text-accent"
                style={{ letterSpacing: "var(--tracking-caps)" }}
              >
                Continue learning
              </p>
              <p className="truncate text-title font-semibold text-text-primary">
                {resume.title}
              </p>
              <p className="text-caption text-text-muted">
                {kindLabel(resume.targetType)}
                {resume.completedLessons > 0
                  ? ` · ${resume.completedLessons} ${(resume.completedLessons ===
                    1
                      ? term("lesson").singular
                      : term("lesson").plural
                    ).toLowerCase()} done`
                  : " · not started yet"}
              </p>
            </div>
            <Link
              href={`/${orgSlug}/learn/${resume.id}`}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-md bg-accent px-4 py-2.5 text-label font-medium text-accent-contrast transition-opacity duration-[var(--motion-fast)] hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {resume.completedLessons > 0 ? "Continue" : "Start"}
              <span aria-hidden>→</span>
            </Link>
          </div>
        </Card>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-title font-semibold text-text-primary">
          Your {term("learning_path").plural.toLowerCase()}
        </h2>
        {enrollments.length ? (
          <ul className="grid gap-3 sm:grid-cols-2">
            {enrollments.map((e) => {
              const isComplete = e.status === "completed";
              return (
                <li key={e.id}>
                  <Link
                    href={`/${orgSlug}/learn/${e.id}`}
                    className="group flex h-full flex-col justify-between gap-4 rounded-lg border border-border bg-surface p-4 shadow-raised transition-all duration-[var(--motion-fast)] hover:border-border-strong hover:shadow-overlay focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  >
                    <div className="space-y-1">
                      <p
                        className="text-caption uppercase text-text-muted"
                        style={{ letterSpacing: "var(--tracking-caps)" }}
                      >
                        {kindLabel(e.targetType)}
                      </p>
                      <p className="text-body font-medium text-text-primary">
                        {e.title}
                      </p>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-caption text-text-muted">
                        {e.completedLessons > 0
                          ? `${e.completedLessons} ${(e.completedLessons === 1
                              ? term("lesson").singular
                              : term("lesson").plural
                            ).toLowerCase()} done`
                          : "Not started"}
                      </span>
                      <Badge tone={isComplete ? "accent" : "positive"}>
                        {isComplete ? "Completed" : "In progress"}
                      </Badge>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <Card>
            <EmptyState
              title="Your Academy is ready when you are"
              description={`When a ${term("learning_path").singular.toLowerCase()} is assigned to you, it will appear here to start.`}
            />
          </Card>
        )}
      </section>

      {activeCredentials.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-title font-semibold text-text-primary">
            Your {term("certificate").plural.toLowerCase()}
          </h2>
          <ul className="space-y-2">
            {activeCredentials.map((cred) => (
              <li
                key={cred.id}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3 shadow-raised"
              >
                <span aria-hidden className="text-lg text-accent">
                  ◆
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body font-medium text-text-primary">
                    {cred.title}
                  </span>
                  <span className="text-caption text-text-muted">
                    Earned {new Date(cred.issuedAt).toLocaleDateString()}
                    {cred.expiresAt
                      ? ` · valid until ${new Date(cred.expiresAt).toLocaleDateString()}`
                      : ""}
                  </span>
                </span>
                <Link
                  href={`/verify/${cred.verificationCode}`}
                  className="rounded-md px-2 py-1 font-mono text-caption text-accent transition-colors hover:bg-surface-interactive hover:text-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  Verify ↗
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
