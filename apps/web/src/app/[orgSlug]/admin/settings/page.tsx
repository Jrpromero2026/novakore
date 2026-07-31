import type { Metadata } from "next";
import { requireOrgContext, requirePermission } from "@/lib/org-context";
import { PageHeader, Panel, SectionHeader } from "@/components/ui/layout";
import { OrgNameForm } from "./org-name-form";

export const metadata: Metadata = { title: "Settings" };

/**
 * Organization settings. Split out of Overview so the workspace home stays
 * an operational surface rather than a miscellaneous settings page.
 * Authorization is unchanged: `org.manage` gates this route.
 */
export default async function OrgSettingsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const ctx = await requireOrgContext(orgSlug);
  requirePermission(ctx, "org.manage");

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Organization"
        title="Settings"
        description="Identity and profile for this organization. Theme and logo live in Branding; vocabulary lives in Terminology."
      />

      <section>
        <SectionHeader
          title="Profile"
          description="The display name members and learners see."
        />
        <Panel tone="outlined" className="mt-2.5 p-5">
          <OrgNameForm orgSlug={orgSlug} currentName={ctx.organization.name} />
        </Panel>
      </section>

      <section>
        <SectionHeader
          title="Address"
          description="Permanent identifiers for this organization."
        />
        <Panel tone="outlined" className="mt-2.5 divide-y divide-border-subtle">
          <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 py-3.5">
            <span className="text-body-sm text-text-secondary">
              Workspace slug
            </span>
            <span className="font-mono text-body-sm text-text-primary">
              /{ctx.organization.slug}
            </span>
          </div>
          <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 py-3.5">
            <span className="text-body-sm text-text-secondary">Status</span>
            <span className="text-body-sm text-text-primary">
              {ctx.organization.status}
            </span>
          </div>
          <p className="px-5 py-3 text-caption text-text-muted">
            The slug is permanent — contact NovaKore to change it.
          </p>
        </Panel>
      </section>
    </div>
  );
}
