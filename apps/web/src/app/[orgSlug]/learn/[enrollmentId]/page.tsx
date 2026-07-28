import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireOrgContext } from "@/lib/org-context";
import { requireUser } from "@/lib/auth";
import { getEnrolledPath } from "@/lib/data/learning";
import { getTerminology } from "@/lib/terminology";
import { supabaseServer } from "@/lib/supabase/server";
import { Badge, Card, CardHeader } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Learning" };

/** Enrollment overview: path → node map with lock reasons; course → redirect. */
export default async function EnrollmentOverviewPage({
  params,
}: {
  params: Promise<{ orgSlug: string; enrollmentId: string }>;
}) {
  const { orgSlug, enrollmentId } = await params;
  const ctx = await requireOrgContext(orgSlug);
  const user = await requireUser();
  const { term } = await getTerminology(ctx.organization.id);

  const supabase = await supabaseServer();
  const { data: enrollment } = await supabase
    .from("enrollments")
    .select(
      "id, target_type, course_id, organization_memberships!inner(user_id)",
    )
    .eq("id", enrollmentId)
    .eq("organization_memberships.user_id", user.id)
    .maybeSingle();
  if (!enrollment) notFound();

  if (enrollment.target_type === "course" && enrollment.course_id) {
    redirect(
      `/${orgSlug}/learn/${enrollmentId}/courses/${enrollment.course_id}`,
    );
  }

  const path = await getEnrolledPath(enrollmentId, user.id);
  if (!path) notFound();

  const stateBadge = {
    available: { tone: "positive" as const, label: "Available" },
    completed: { tone: "accent" as const, label: "Completed" },
    locked_by_prerequisite: { tone: "neutral" as const, label: "Locked" },
    not_enrolled: { tone: "warning" as const, label: "Unavailable" },
  };

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <p
          className="text-caption uppercase text-text-muted"
          style={{ letterSpacing: "var(--tracking-caps)" }}
        >
          <Link href={`/${orgSlug}/learn`} className="hover:text-text-primary">
            My learning
          </Link>{" "}
          / {term("learning_path").singular.toLowerCase()}
        </p>
        <h1 className="text-h1 text-text-primary">{path.pathTitle}</h1>
      </header>

      <Card>
        <CardHeader
          title={term("course").plural}
          description={`Complete each ${term("course").singular.toLowerCase()} to unlock what follows.`}
        />
        <ol className="divide-y divide-border-subtle">
          {path.nodes.map((node, index) => {
            const badge = stateBadge[node.state];
            const interactive =
              node.state === "available" || node.state === "completed";
            const inner = (
              <>
                <span className="text-caption tabular-nums text-text-muted">
                  {index + 1}.
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body font-medium text-text-primary">
                    {node.title}
                  </span>
                  {node.reason ? (
                    <span className="text-caption text-text-muted">
                      {node.reason}
                    </span>
                  ) : null}
                </span>
                <Badge tone={badge.tone}>{badge.label}</Badge>
              </>
            );
            return (
              <li key={node.nodeId}>
                {interactive ? (
                  <Link
                    href={`/${orgSlug}/learn/${enrollmentId}/courses/${node.courseId}`}
                    className="flex items-center gap-3 px-5 py-4 transition-colors hover:bg-surface-interactive"
                  >
                    {inner}
                  </Link>
                ) : (
                  <div
                    aria-disabled
                    className="flex items-center gap-3 px-5 py-4 opacity-80"
                  >
                    {inner}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </Card>
    </div>
  );
}
