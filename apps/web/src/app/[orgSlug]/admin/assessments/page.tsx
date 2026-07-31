import type { Metadata } from "next";
import { requireOrgContext, requirePermission } from "@/lib/org-context";
import { getTerminology } from "@/lib/terminology";
import { listAssessments } from "@/lib/data/assessments";
import { Badge, EmptyState } from "@/components/ui/primitives";
import {
  DataRow,
  PageHeader,
  Panel,
  SectionHeader,
} from "@/components/ui/layout";
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
    <div className="space-y-8">
      <PageHeader
        eyebrow="Learning"
        title={term("assessment").plural}
        description="Drafts are editable; published versions are immutable and are what learners attempt. Grading is server-side, always."
      />

      <CreateAssessmentPanel
        orgSlug={orgSlug}
        termSingular={term("assessment").singular}
      />

      <section>
        <SectionHeader
          title={`All ${term("assessment").plural.toLowerCase()}`}
          count={assessments.length}
        />
        <Panel tone="outlined" className="mt-2.5">
          {assessments.length === 0 ? (
            <EmptyState
              title={`No ${term("assessment").plural.toLowerCase()} yet`}
              description="Create the first one to attach it to learning content. Assessments stay in draft until you publish a version."
            />
          ) : (
            <ul className="p-1.5">
              {assessments.map((a) => (
                <li key={a.id}>
                  <DataRow
                    href={`/${orgSlug}/admin/assessments/${a.id}`}
                    title={a.title}
                    meta={`${a.assessmentType.replace(/_/g, " ")} · ${a.itemCount} item${a.itemCount === 1 ? "" : "s"}`}
                    trailing={
                      <Badge
                        tone={a.publishedVersionNumber ? "positive" : "warning"}
                      >
                        {a.publishedVersionNumber
                          ? `Published v${a.publishedVersionNumber}`
                          : "unpublished"}
                      </Badge>
                    }
                  />
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </section>
    </div>
  );
}
