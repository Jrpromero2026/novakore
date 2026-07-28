import type { Metadata } from "next";
import { AccessDenied } from "@/components/states";

export const metadata: Metadata = { title: "Access denied" };

export default async function DeniedPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  return <AccessDenied backHref={`/${orgSlug}/admin`} />;
}
