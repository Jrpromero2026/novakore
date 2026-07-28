import type { Metadata } from "next";
import { PLATFORM_TERM_DEFAULTS, TERM_KEYS } from "@novakore/domain";
import { requireOrgContext, requirePermission } from "@/lib/org-context";
import { getTerminology } from "@/lib/terminology";
import { Card, CardHeader } from "@/components/ui/primitives";
import { TermRow } from "./terminology-ui";

export const metadata: Metadata = { title: "Terminology" };

export default async function TerminologyPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const ctx = await requireOrgContext(orgSlug);
  requirePermission(ctx, "org.terminology.manage");

  const { overrides } = await getTerminology(ctx.organization.id);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight text-text">
          Terminology
        </h1>
        <p className="text-sm text-text-muted">
          Rename what learners and staff see — a Course can be a Program, an
          Instructor a Coach. The platform&apos;s internal names never change,
          so integrations stay stable.
        </p>
      </header>

      <Card>
        <CardHeader
          title="Display terms"
          description="Overridden terms are highlighted. Reset returns a term to the NovaKore default."
        />
        <ul className="divide-y divide-border">
          {TERM_KEYS.map((key) => (
            <TermRow
              key={key}
              orgSlug={orgSlug}
              termKey={key}
              platformDefault={PLATFORM_TERM_DEFAULTS[key]}
              override={overrides[key] ?? null}
            />
          ))}
        </ul>
      </Card>
    </div>
  );
}
