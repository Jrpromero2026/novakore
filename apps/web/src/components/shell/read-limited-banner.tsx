import { Alert } from "@/components/ui/feedback";
import { isOrgReadLimited, type OrgContext } from "@/lib/org-context";

/**
 * Shell-level notice for a non-active (read-limited) organization. Renders
 * nothing for active workspaces. The actual enforcement lives in
 * org-context.can and the ownership-based actions — this only tells members
 * why every editing affordance has disappeared.
 */
export function ReadLimitedBanner({ ctx }: { ctx: OrgContext }) {
  if (!isOrgReadLimited(ctx)) return null;
  return (
    <div className="mb-6">
      <Alert tone="warning" title="Workspace suspended">
        This workspace is read-limited: existing content stays visible, but
        changes are disabled until it is reactivated.
      </Alert>
    </div>
  );
}
