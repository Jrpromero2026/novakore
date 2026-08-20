import Link from "next/link";
import { Badge } from "@/components/ui/primitives";
import { IconArrowRight } from "@/components/ui/icons";

export interface RailLink {
  href: string;
  label: string;
}

/**
 * The right-hand panel: which organization am I in, and what do I reach from
 * here.
 *
 * It carries the identity the sidebar used to hold. With a horizontal nav
 * there is no persistent column stating which workspace you are editing, and
 * "which organization am I changing?" must never become a guess — so the
 * answer lives here, on every domain page.
 *
 * Quick links are shortcuts to destinations already reachable through the
 * cards. They exist to shorten a known journey, never to expose something the
 * hierarchy hides; anything only reachable here would be a hole in the model.
 */
export function ContextRail({
  organizationName,
  organizationSlug,
  status,
  ownerName,
  ownerEmail,
  quickLinks = [],
}: {
  organizationName: string;
  organizationSlug: string;
  status: string;
  ownerName?: string | null;
  ownerEmail?: string | null;
  quickLinks?: readonly RailLink[];
}) {
  return (
    <aside
      aria-label="Organization context"
      className="rounded-xl border border-border bg-surface p-5"
    >
      <span
        aria-hidden="true"
        className="grid size-11 place-items-center rounded-lg bg-text text-base font-bold text-background"
      >
        {organizationName.slice(0, 1).toUpperCase()}
      </span>

      <h2 className="mt-3.5 text-title font-semibold leading-snug text-text">
        {organizationName}
      </h2>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Badge tone={status === "active" ? "positive" : "warning"}>
          {status}
        </Badge>
        <span className="font-mono text-caption text-text-muted">
          /{organizationSlug}
        </span>
      </div>

      {ownerEmail ? (
        <div className="mt-5 border-t border-border-subtle pt-4">
          <p className="text-caption text-text-muted">Workspace owner</p>
          {ownerName ? (
            <p className="mt-1 text-body-sm font-medium text-text">
              {ownerName}
            </p>
          ) : null}
          <p className="text-body-sm text-text-secondary">{ownerEmail}</p>
        </div>
      ) : null}

      {quickLinks.length > 0 ? (
        <div className="mt-5 border-t border-border-subtle pt-4">
          <p className="text-caption text-text-muted">Quick links</p>
          <ul className="mt-2 space-y-0.5">
            {quickLinks.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="group -mx-1.5 flex items-center justify-between gap-2 rounded-md px-1.5 py-1.5 text-body-sm text-text-secondary transition-colors hover:bg-surface-sunken hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  <span className="truncate">{link.label}</span>
                  <IconArrowRight
                    aria-hidden="true"
                    className="size-3.5 shrink-0 text-text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-accent"
                  />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </aside>
  );
}
