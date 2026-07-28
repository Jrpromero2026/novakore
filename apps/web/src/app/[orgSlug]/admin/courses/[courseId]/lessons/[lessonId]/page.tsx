import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { contentBlockSchema, type ContentBlock } from "@novakore/domain";
import { can, requireOrgContext, requirePermission } from "@/lib/org-context";
import { supabaseServer } from "@/lib/supabase/server";
import { LessonEditor } from "./lesson-editor";

export const metadata: Metadata = { title: "Lesson editor" };

export default async function LessonEditorPage({
  params,
}: {
  params: Promise<{ orgSlug: string; courseId: string; lessonId: string }>;
}) {
  const { orgSlug, courseId, lessonId } = await params;
  const ctx = await requireOrgContext(orgSlug);
  requirePermission(ctx, "content.view_draft");

  const supabase = await supabaseServer();
  const [{ data: lesson }, { data: blocks }] = await Promise.all([
    supabase
      .from("lessons")
      .select(
        "id, title, status, required, current_published_version_id, lesson_versions!lessons_current_published_version_fk(id, version_number, title, blocks, published_at)",
      )
      .eq("id", lessonId)
      .eq("course_id", courseId)
      .eq("organization_id", ctx.organization.id)
      .maybeSingle(),
    supabase
      .from("content_blocks")
      .select("id, block_type, schema_version, data, position")
      .eq("lesson_id", lessonId)
      .order("position"),
  ]);
  if (!lesson) notFound();

  const draftBlocks: ContentBlock[] = [];
  for (const b of blocks ?? []) {
    const parsed = contentBlockSchema.safeParse({
      id: b.id,
      type: b.block_type,
      schemaVersion: b.schema_version,
      data: b.data,
      position: b.position,
    });
    if (parsed.success) draftBlocks.push(parsed.data);
  }

  const published = lesson.lesson_versions as {
    id: string;
    version_number: number;
    title: string;
    blocks: unknown;
    published_at: string;
  } | null;

  // Draft-vs-published comparison summary (historical version untouched).
  // Serialization must be key-order independent: jsonb normalizes key order,
  // so a naive JSON.stringify flags every block as changed.
  const stable = (value: unknown): string =>
    Array.isArray(value)
      ? `[${value.map(stable).join(",")}]`
      : value !== null && typeof value === "object"
        ? `{${Object.entries(value as Record<string, unknown>)
            .sort(([a], [b]) => (a < b ? -1 : 1))
            .map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`)
            .join(",")}}`
        : JSON.stringify(value);
  let comparison: {
    added: number;
    removed: number;
    changed: number;
    titleChanged: boolean;
  } | null = null;
  if (published && Array.isArray(published.blocks)) {
    const publishedBlocks = published.blocks as { id: string; data: unknown }[];
    const publishedById = new Map(
      publishedBlocks.map((b) => [b.id, stable(b)]),
    );
    const draftById = new Map(
      draftBlocks.map((b) => [
        b.id,
        stable({
          id: b.id,
          type: b.type,
          schemaVersion: b.schemaVersion,
          data: b.data,
          position: b.position,
        }),
      ]),
    );
    comparison = {
      added: draftBlocks.filter((b) => !publishedById.has(b.id)).length,
      removed: publishedBlocks.filter((b) => !draftById.has(b.id)).length,
      changed: draftBlocks.filter(
        (b) =>
          publishedById.has(b.id) &&
          publishedById.get(b.id) !== draftById.get(b.id),
      ).length,
      titleChanged: lesson.title !== published.title,
    };
  }

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
          / lesson editor
        </p>
        <h1 className="text-h1 text-text-primary">{lesson.title}</h1>
      </header>

      <LessonEditor
        orgSlug={orgSlug}
        lessonId={lessonId}
        initialBlocks={draftBlocks}
        canPublish={can(ctx, "content.publish")}
        published={
          published
            ? {
                versionNumber: published.version_number,
                publishedAt: published.published_at,
              }
            : null
        }
        comparison={comparison}
      />
    </div>
  );
}
