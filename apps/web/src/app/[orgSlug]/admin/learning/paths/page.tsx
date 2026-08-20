import type { Metadata } from "next";
import { requireOrgContext, requirePermission } from "@/lib/org-context";
import { getTerminology } from "@/lib/terminology";
import { supabaseServer } from "@/lib/supabase/server";
import { Card, CardHeader, EmptyState } from "@/components/ui/primitives";
import { PageHeader } from "@/components/ui/layout";
import { tourState } from "@/lib/onboarding/targets";
import { ContextHelp } from "@/components/onboarding/context-help";
import { StartWalkthroughButton } from "@/components/onboarding/walkthrough";
import { CreatePathPanel, CreateSystemPanel, PathCard } from "./learning-ui";

export const metadata: Metadata = { title: "Learning" };

export default async function LearningPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const ctx = await requireOrgContext(orgSlug);
  requirePermission(ctx, "paths.manage");
  const { term } = await getTerminology(ctx.organization.id);

  const supabase = await supabaseServer();
  const [
    { data: systems },
    { data: paths },
    { data: nodes },
    { data: prereqs },
    { data: courses },
  ] = await Promise.all([
    supabase
      .from("learning_systems")
      .select("id, title, slug, status")
      .eq("organization_id", ctx.organization.id)
      .neq("status", "archived")
      .order("created_at"),
    supabase
      .from("learning_paths")
      .select("id, learning_system_id, title, slug, status")
      .eq("organization_id", ctx.organization.id)
      .neq("status", "archived")
      .order("created_at"),
    supabase
      .from("path_nodes")
      .select("id, path_id, course_id, position")
      .eq("organization_id", ctx.organization.id)
      .order("position"),
    supabase
      .from("prerequisites")
      .select("id, path_id, node_id, requires_node_id")
      .eq("organization_id", ctx.organization.id),
    supabase
      .from("courses")
      .select("id, title, current_published_version_id")
      .eq("organization_id", ctx.organization.id)
      .neq("status", "archived")
      .order("title"),
  ]);

  return (
    <div className="space-y-8" {...tourState({ paths: (paths ?? []).length })}>
      <PageHeader
        eyebrow="Learning"
        title={`${term("learning_system").plural} & ${term("learning_path").plural}`}
        description={`${term("learning_path").plural} sequence ${term("course").plural.toLowerCase()} with governed prerequisites. Cycles are rejected by the platform.`}
      />

      <ContextHelp
        summary={`What is a ${term("learning_path").singular}?`}
        className="max-w-2xl"
      >
        A {term("learning_path").singular} is the complete learning experience —
        for example Coach Certification, Employee Onboarding, or Leadership
        Development. It sequences {term("course").plural.toLowerCase()} and can
        require some before others. A {term("learning_system").singular} is the
        container that groups related{" "}
        {term("learning_path").plural.toLowerCase()}.
      </ContextHelp>

      <CreateSystemPanel
        orgSlug={orgSlug}
        termSingular={term("learning_system").singular}
      />

      {(systems ?? []).map((system) => (
        <Card key={system.id}>
          <CardHeader
            title={system.title}
            description={`${term("learning_system").singular} · /${system.slug} · ${system.status}`}
          />
          <div className="space-y-4 px-5 py-4">
            {(paths ?? [])
              .filter((p) => p.learning_system_id === system.id)
              .map((path) => (
                <PathCard
                  key={path.id}
                  orgSlug={orgSlug}
                  path={path}
                  nodes={(nodes ?? []).filter((n) => n.path_id === path.id)}
                  prerequisites={(prereqs ?? []).filter(
                    (p2) => p2.path_id === path.id,
                  )}
                  courses={(courses ?? []).map((c) => ({
                    id: c.id,
                    title: c.title,
                    published: c.current_published_version_id !== null,
                  }))}
                  pathTerm={term("learning_path").singular}
                  courseTerm={term("course").singular}
                />
              ))}
            <CreatePathPanel
              orgSlug={orgSlug}
              learningSystemId={system.id}
              pathTerm={term("learning_path").singular}
            />
          </div>
        </Card>
      ))}

      {(systems ?? []).length === 0 ? (
        <Card>
          <EmptyState
            title={`No ${term("learning_path").plural.toLowerCase()} yet`}
            description={`${term("learning_path").plural} are complete learning experiences, such as Coach Certification or Leadership Development. Create a ${term("learning_system").singular.toLowerCase()} above to hold them, then add your first ${term("learning_path").singular.toLowerCase()}.`}
            action={
              <StartWalkthroughButton
                walkthroughId="create-journey"
                className="nk-press rounded-md bg-accent px-3.5 py-2 text-sm font-medium text-accent-contrast hover:bg-accent-hover"
              >
                Show me
              </StartWalkthroughButton>
            }
          />
        </Card>
      ) : null}
    </div>
  );
}
