import type { Metadata } from "next";
import Link from "next/link";
import { requireOrgContext, requirePermission } from "@/lib/org-context";
import { getTerminology } from "@/lib/terminology";
import { supabaseServer } from "@/lib/supabase/server";
import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
} from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Paths · Studio" };

export default async function StudioPathsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const ctx = await requireOrgContext(orgSlug);
  requirePermission(ctx, "content.view_draft");
  const { term } = await getTerminology(ctx.organization.id);
  const supabase = await supabaseServer();
  const { data: paths } = await supabase
    .from("learning_paths")
    .select("id, title, status, path_nodes(count)")
    .eq("organization_id", ctx.organization.id)
    .neq("status", "archived")
    .order("created_at");

  return (
    <Card>
      <CardHeader
        title={`${term("learning_path").plural} (${paths?.length ?? 0})`}
        description={`Open a ${term("learning_path").singular.toLowerCase()} on the canvas to arrange nodes and prerequisites. Create new ones under Admin → Learning.`}
      />
      {!paths || paths.length === 0 ? (
        <EmptyState
          title={`No ${term("learning_path").plural.toLowerCase()} yet`}
          description="Create one under Admin → Learning, then design it here."
        />
      ) : (
        <ul className="divide-y divide-border-subtle">
          {paths.map((path) => (
            <li key={path.id}>
              <Link
                href={`/${orgSlug}/admin/studio/paths/${path.id}`}
                className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-surface-interactive"
              >
                <span className="min-w-0 flex-1 truncate text-body font-medium text-text-primary">
                  {path.title}
                </span>
                <span className="text-caption text-text-muted">
                  {(path.path_nodes as unknown as { count: number }[])[0]
                    ?.count ?? 0}{" "}
                  nodes
                </span>
                <Badge tone={path.status === "active" ? "positive" : "neutral"}>
                  {path.status}
                </Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
