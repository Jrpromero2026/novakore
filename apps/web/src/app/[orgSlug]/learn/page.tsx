import type { Metadata } from "next";
import Link from "next/link";
import { requireOrgContext } from "@/lib/org-context";
import { requireUser } from "@/lib/auth";
import { getMyEnrollments } from "@/lib/data/learning";
import { getMyCredentials } from "@/lib/data/assessments";
import { getTerminology } from "@/lib/terminology";
import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
} from "@/components/ui/primitives";

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

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-h1 text-text-primary">My learning</h1>
        <p className="text-body-sm text-text-secondary">
          Your assigned {term("learning_path").plural.toLowerCase()} and{" "}
          {term("course").plural.toLowerCase()}.
        </p>
      </header>

      <Card>
        <CardHeader title="Assigned to you" />
        {enrollments.length ? (
          <ul className="divide-y divide-border-subtle">
            {enrollments.map((e) => (
              <li key={e.id}>
                <Link
                  href={`/${orgSlug}/learn/${e.id}`}
                  className="flex flex-wrap items-center gap-3 px-5 py-4 transition-colors hover:bg-surface-interactive"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body font-medium text-text-primary">
                      {e.title}
                    </span>
                    <span className="text-caption text-text-muted">
                      {e.targetType === "learning_path"
                        ? term("learning_path").singular
                        : term("course").singular}
                      {e.completedLessons > 0
                        ? ` · ${e.completedLessons} ${(e.completedLessons === 1
                            ? term("lesson").singular
                            : term("lesson").plural
                          ).toLowerCase()} done`
                        : ""}
                    </span>
                  </span>
                  <Badge
                    tone={e.status === "completed" ? "accent" : "positive"}
                  >
                    {e.status === "completed" ? "Completed" : "In progress"}
                  </Badge>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            title="Nothing assigned yet"
            description="When learning is assigned to you it appears here."
          />
        )}
      </Card>

      {credentials.length > 0 ? (
        <Card>
          <CardHeader
            title={`Your ${term("certificate").plural.toLowerCase()}`}
            description="Each credential has a public verification link you can share."
          />
          <ul className="divide-y divide-border-subtle">
            {credentials.map((cred) => (
              <li
                key={cred.id}
                className="flex flex-wrap items-center gap-3 px-5 py-4"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body font-medium text-text-primary">
                    {cred.title}
                  </span>
                  <span className="text-caption text-text-muted">
                    Issued {new Date(cred.issuedAt).toLocaleDateString()} to{" "}
                    {cred.recipientName}
                    {cred.expiresAt
                      ? ` · valid until ${new Date(cred.expiresAt).toLocaleDateString()}`
                      : ""}
                  </span>
                </span>
                <Badge
                  tone={
                    cred.status === "active"
                      ? "positive"
                      : cred.status === "revoked"
                        ? "danger"
                        : "warning"
                  }
                >
                  {cred.status}
                </Badge>
                <Link
                  href={`/verify/${cred.verificationCode}`}
                  className="font-mono text-caption text-accent hover:text-accent-hover"
                >
                  {cred.verificationCode}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
