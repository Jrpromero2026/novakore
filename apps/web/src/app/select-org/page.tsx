import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { acceptInvitationAction } from "@/lib/actions/members";
import { signOutAction } from "@/lib/actions/auth";
import { requireUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { NoOrganization } from "@/components/states";
import { Badge, Button } from "@/components/ui/primitives";
import { ThemeToggle } from "@/components/theme-toggle";

export const metadata: Metadata = { title: "Choose organization" };

export default async function SelectOrgPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireUser();
  const { error } = await searchParams;
  const supabase = await supabaseServer();

  // Scope explicitly to the caller: member-managers can SEE other people's
  // memberships through RLS, but this page is only ever about their own.
  const [{ data: activeRows }, { data: invitedRows }] = await Promise.all([
    supabase
      .from("organization_memberships")
      .select("id, organization_id, organizations!inner(id, name, slug)")
      .eq("user_id", user.id)
      .eq("status", "active")
      .order("created_at"),
    user.email
      ? supabase
          .from("organization_memberships")
          .select(
            "id, organization_id, invited_email, organizations!inner(id, name, slug)",
          )
          .eq("status", "invited")
          .ilike("invited_email", user.email)
          .order("created_at")
      : Promise.resolve({ data: [] as never[] }),
  ]);

  const active = activeRows ?? [];
  const invited = invitedRows ?? [];

  // Single active org and nothing pending: skip the selector entirely.
  if (active.length === 1 && invited.length === 0) {
    redirect(`/${active[0]!.organizations.slug}/admin`);
  }

  const signOutButton = (
    <form action={signOutAction}>
      <Button type="submit" variant="secondary">
        Sign out
      </Button>
    </form>
  );

  if (active.length === 0 && invited.length === 0) {
    return (
      <main className="flex min-h-dvh flex-col px-6">
        <div className="flex justify-end py-4">
          <ThemeToggle />
        </div>
        <NoOrganization email={user.email} signOut={signOutButton} />
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col px-6 py-10">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-text-faint">
          NovaKore
        </p>
        <ThemeToggle />
      </div>
      <div className="mt-12 space-y-6">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-text">
            Choose an organization
          </h1>
          <p className="text-sm text-text-muted">Signed in as {user.email}</p>
        </header>

        {error === "accept" ? (
          <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
            That invitation could not be accepted. It may have been revoked.
          </p>
        ) : null}

        {active.length > 0 ? (
          <ul className="space-y-2">
            {active.map((m) => (
              <li key={m.id}>
                <Link
                  href={`/${m.organizations.slug}/admin`}
                  className="flex items-center justify-between rounded-lg border border-border bg-surface px-4 py-3.5 shadow-raised transition-colors hover:border-border-strong"
                >
                  <span className="text-sm font-medium text-text">
                    {m.organizations.name}
                  </span>
                  <span className="text-xs text-text-faint">
                    /{m.organizations.slug}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : null}

        {invited.length > 0 ? (
          <section className="space-y-2">
            <h2 className="text-sm font-medium text-text-muted">
              Pending invitations
            </h2>
            <ul className="space-y-2">
              {invited.map((m) => (
                <li
                  key={m.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-border-strong bg-surface px-4 py-3.5"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-text">
                      {m.organizations.name}
                    </span>
                    <Badge tone="accent">Invited</Badge>
                  </div>
                  <form
                    action={acceptInvitationAction.bind(
                      null,
                      m.organization_id,
                    )}
                  >
                    <Button type="submit">Accept</Button>
                  </form>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <div className="pt-4">{signOutButton}</div>
      </div>
    </main>
  );
}
