import type { Metadata } from "next";
import { DomainLanding } from "@/components/shell/domain-landing";

export const metadata: Metadata = { title: "Workspace" };

export default async function WorkspacePage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  // Workspace administers the organization itself, so it is the one domain
  // that restates which organization that is.
  return <DomainLanding orgSlug={orgSlug} domainKey="workspace" showRail />;
}
