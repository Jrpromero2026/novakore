import type { Metadata } from "next";
import { DomainLanding } from "@/components/shell/domain-landing";

export const metadata: Metadata = { title: "People" };

export default async function PeopleDomainPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  return <DomainLanding orgSlug={orgSlug} domainKey="people" />;
}
