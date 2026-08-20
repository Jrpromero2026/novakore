import type { Metadata } from "next";
import { DomainLanding } from "@/components/shell/domain-landing";

export const metadata: Metadata = { title: "Knowledge" };

export default async function KnowledgePage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  return <DomainLanding orgSlug={orgSlug} domainKey="knowledge" />;
}
