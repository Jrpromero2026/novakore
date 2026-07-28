import type { Metadata } from "next";
import { requireOrgContext, requirePermission } from "@/lib/org-context";
import { supabaseServer } from "@/lib/supabase/server";
import { Card, CardHeader } from "@/components/ui/primitives";
import { CreateRolePanel, RoleEditor } from "./roles-ui";

export const metadata: Metadata = { title: "Roles & permissions" };

export default async function RolesPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const ctx = await requireOrgContext(orgSlug);
  requirePermission(ctx, "org.roles.manage");

  const supabase = await supabaseServer();
  const [{ data: roles }, { data: permissions }] = await Promise.all([
    supabase
      .from("organization_roles")
      .select(
        "id, key, name, description, is_system, organization_role_permissions(permission_code)",
      )
      .eq("organization_id", ctx.organization.id)
      .eq("status", "active")
      .order("is_system", { ascending: false })
      .order("name"),
    supabase
      .from("permissions")
      .select("code, description, category")
      .order("category")
      .order("code"),
  ]);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight text-text">
          Roles &amp; permissions
        </h1>
        <p className="text-sm text-text-muted">
          Roles bundle platform permissions. System roles are managed by
          NovaKore; create custom roles for anything else.
        </p>
      </header>

      <CreateRolePanel orgSlug={orgSlug} />

      <Card>
        <CardHeader
          title={`Roles (${roles?.length ?? 0})`}
          description="Select a role to review or edit its permission bundle."
        />
        <RoleEditor
          orgSlug={orgSlug}
          roles={(roles ?? []).map((r) => ({
            id: r.id,
            key: r.key,
            name: r.name,
            description: r.description,
            isSystem: r.is_system,
            granted: r.organization_role_permissions.map(
              (p) => p.permission_code,
            ),
          }))}
          permissions={permissions ?? []}
        />
      </Card>
    </div>
  );
}
