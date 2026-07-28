import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { courseStructureSchema } from "@novakore/domain";
import { requireOrgContext, requirePermission } from "@/lib/org-context";
import { supabaseServer } from "@/lib/supabase/server";
import { Badge, Card, CardHeader } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Published version" };

export default async function CourseVersionPage({
  params,
}: {
  params: Promise<{ orgSlug: string; courseId: string; versionId: string }>;
}) {
  const { orgSlug, courseId, versionId } = await params;
  const ctx = await requireOrgContext(orgSlug);
  requirePermission(ctx, "content.view_draft");

  const supabase = await supabaseServer();
  const { data: version } = await supabase
    .from("course_versions")
    .select(
      "id, course_id, version_number, title, summary, structure, completion_rule, published_at, supersedes_version_id",
    )
    .eq("id", versionId)
    .eq("course_id", courseId)
    .maybeSingle();
  if (!version) notFound();

  const structure = courseStructureSchema.safeParse(version.structure);
  const { count: enrollmentPins } = await supabase
    .from("progress_records")
    .select("id", { count: "exact", head: true })
    .eq("course_version_id", versionId)
    .eq("subject_type", "course");

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <p
          className="text-caption uppercase text-text-muted"
          style={{ letterSpacing: "var(--tracking-caps)" }}
        >
          <Link
            href={`/${orgSlug}/admin/courses/${courseId}`}
            className="hover:text-text-primary"
          >
            Course builder
          </Link>{" "}
          / published version
        </p>
        <h1 className="text-h1 text-text-primary">
          {version.title} — Version {version.version_number}
        </h1>
        <p className="text-body-sm text-text-secondary">
          Immutable snapshot · published{" "}
          {new Date(version.published_at).toLocaleString()} ·{" "}
          {enrollmentPins ?? 0} enrollment(s) pinned to this version
        </p>
      </header>

      <Card>
        <CardHeader
          title="Pinned structure"
          description="Exact lesson versions frozen at publication. This snapshot never changes."
        />
        {structure.success ? (
          <div className="space-y-4 px-5 py-4">
            {structure.data.modules.map((m) => (
              <section key={m.moduleId}>
                <h2 className="text-title text-text-primary">{m.title}</h2>
                <ul className="mt-1.5 space-y-1">
                  {m.lessons.map((l) => (
                    <li
                      key={l.lessonId}
                      className="flex flex-wrap items-center gap-2 text-body-sm text-text-primary"
                    >
                      {l.title}
                      <Badge tone="accent">lesson v{l.versionNumber}</Badge>
                      {!l.required ? (
                        <Badge tone="neutral">optional</Badge>
                      ) : null}
                      <span className="font-mono text-caption text-text-faint">
                        {l.lessonVersionId}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            <p className="text-caption text-text-muted">
              Completion rule:{" "}
              <span className="font-mono">
                {JSON.stringify(version.completion_rule)}
              </span>
            </p>
          </div>
        ) : (
          <p className="px-5 py-4 text-body-sm text-danger">
            Snapshot failed schema validation — investigate before relying on
            this version.
          </p>
        )}
      </Card>
    </div>
  );
}
