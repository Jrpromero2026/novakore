import type { Metadata } from "next";
import Link from "next/link";
import { requireOrgContext, requirePermission } from "@/lib/org-context";
import { getTerminology } from "@/lib/terminology";
import { listAssessments } from "@/lib/data/assessments";
import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
} from "@/components/ui/primitives";
import { CreateAssessmentPanel } from "./assessments-ui";

export const metadata: Metadata = { title: "Assessments" };

export default async function AssessmentsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const ctx = await requireOrgContext(orgSlug);
  requirePermission(ctx, "content.view_draft");
  const { term } = await getTerminology(ctx.organization.id);
  const assessments = await listAssessments(ctx.organization.id);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-h1 text-text-primary">
          {term("assessment").plural}
        </h1>
        <p className="text-body-sm text-text-secondary">
          Drafts are editable; published versions are immutable and are what
          learners attempt. Grading is server-side, always.
        </p>
      </header>

      <CreateAssessmentPanel
        orgSlug={orgSlug}
        termSingular={term("assessment").singular}
      />

      <Card>
        <CardHeader
          title={`All ${term("assessment").plural.toLowerCase()} (${assessments.length})`}
        />
        {assessments.length === 0 ? (
          <EmptyState
            title={`No ${term("assessment").plural.toLowerCase()} yet`}
            description="Create the first one to attach it to learning content."
          />
        ) : (
          <ul className="divide-y divide-border-subtle">
            {assessments.map((a) => (
              <li key={a.id}>
                <Link
                  href={`/${orgSlug}/admin/assessments/${a.id}`}
                  className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-surface-interactive"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body font-medium text-text-primary">
                      {a.title}
                    </span>
                    <span className="text-caption text-text-muted">
                      {a.assessmentType.replace(/_/g, " ")} · {a.itemCount} item
                      {a.itemCount === 1 ? "" : "s"}
                    </span>
                  </span>
                  <Badge
                    tone={a.publishedVersionNumber ? "positive" : "warning"}
                  >
                    {a.publishedVersionNumber
                      ? `Published v${a.publishedVersionNumber}`
                      : "unpublished"}
                  </Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
