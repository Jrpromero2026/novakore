import { permanentRedirect } from "next/navigation";

/**
 * Deprecated duplicate.
 *
 * Two surfaces managed learning paths: this read-only listing and the fuller
 * management page at /admin/learning, which owns creation, systems and the
 * walkthrough. The audit found them disagreeing about where paths live; the
 * management surface wins and this redirects to it.
 *
 * A permanent redirect rather than a deletion because the route was linked
 * from the old Studio tab bar and may sit in bookmarks. The path DETAIL
 * editor beneath this route is unaffected and remains canonical.
 */
export default async function DeprecatedStudioPathsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  permanentRedirect(`/${orgSlug}/admin/learning/paths`);
}
