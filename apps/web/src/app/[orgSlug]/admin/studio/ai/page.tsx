import type { Metadata } from "next";
import { can, requireOrgContext, requirePermission } from "@/lib/org-context";
import { getAiWorkspace } from "@/lib/data/studio";
import { AiWorkspace } from "./ai-workspace";

export const metadata: Metadata = { title: "AI Workspace · Studio" };

export default async function StudioAiPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const ctx = await requireOrgContext(orgSlug);
  requirePermission(ctx, "content.view_draft");
  const data = await getAiWorkspace(ctx.organization.id);

  return (
    <AiWorkspace
      orgSlug={orgSlug}
      data={data}
      canGenerate={can(ctx, "ai.author.use")}
      canManageSources={can(ctx, "sources.manage")}
      canAuthor={can(ctx, "content.author")}
      provider={process.env.NOVAKORE_AI_PROVIDER ?? "mock"}
    />
  );
}
