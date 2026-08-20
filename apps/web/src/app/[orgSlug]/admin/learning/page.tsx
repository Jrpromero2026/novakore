import type { Metadata } from "next";
import { DomainLanding } from "@/components/shell/domain-landing";

export const metadata: Metadata = { title: "Learning" };

export default async function LearningDomainPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  return <DomainLanding orgSlug={orgSlug} domainKey="learning" />;
}
