import type { Metadata } from "next";
import Link from "next/link";
import { can, requireOrgContext } from "@/lib/org-context";
import { getTerminology } from "@/lib/terminology";
import { getOrganizationHub } from "@/lib/data/organization";
import { getNovaReport } from "@/lib/data/nova";
import { relativeTime } from "@/lib/format";
import { Panel, SectionHeader, StatusDot } from "@/components/ui/layout";
import { ActivitySparkline } from "@/components/dashboard/viz";
import { IconArrowRight } from "@/components/ui/icons";
import { identityIsEmpty } from "@/lib/org-identity";
import { tourState, tourTarget, TOUR_TARGETS } from "@/lib/onboarding/targets";
import { IdentityForm } from "./identity-form";

export const metadata: Metadata = { title: "Organization" };

/**
 * The Organization Hub — the organization's digital headquarters. Identity
 * (culture the organization supplies), real membership growth, the living
 * timeline (every entry a real dated record), knowledge health, and recent
 * publishing. Everything reinforces belonging; nothing is generic filler.
 */
export default async function OrganizationHubPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const ctx = await requireOrgContext(orgSlug);
  const { term } = await getTerminology(ctx.organization.id);
  const base = `/${orgSlug}/admin`;
  const canManage = can(ctx, "org.manage");
  const canStudio = can(ctx, "content.view_draft");

  const [hub, nova] = await Promise.all([
    getOrganizationHub(ctx.organization.id),
    canStudio
      ? getNovaReport(ctx.organization.id, orgSlug, {
          includeLearner: can(ctx, "analytics.view"),
        })
      : Promise.resolve(null),
  ]);
  const { identity } = hub;

  return (
    <div
      className="space-y-8"
      {...tourState({ identity: !identityIsEmpty(identity) })}
    >
      {/* ---- Identity hero -------------------------------------------------- */}
      <Panel tone="hero" className="nk-fade-up rounded-xl p-6 sm:p-7">
        <p className="flex items-center gap-2 text-caption font-medium uppercase tracking-[var(--tracking-caps)] text-text-muted">
          Organization
          <StatusDot
            tone={ctx.organization.status === "active" ? "positive" : "warning"}
            label={ctx.organization.status}
          />
          {hub.createdAt ? (
            <span className="normal-case tracking-normal">
              · on NovaKore since{" "}
              {new Date(hub.createdAt).toLocaleDateString(undefined, {
                month: "long",
                year: "numeric",
              })}
            </span>
          ) : null}
        </p>
        <h1 className="mt-2 text-[1.875rem] font-semibold leading-tight tracking-tight text-text-primary">
          {ctx.organization.name}
        </h1>
        {identity.mission ? (
          <p className="mt-3 max-w-2xl text-body leading-relaxed text-text-secondary">
            {identity.mission}
          </p>
        ) : (
          <p className="mt-3 max-w-2xl text-body-sm text-text-muted">
            {canManage
              ? "No mission recorded yet — identity added here shapes how the whole workspace reads."
              : "The organization hasn't recorded its mission yet."}
          </p>
        )}
        {identity.vision ? (
          <p className="mt-2 max-w-2xl text-body-sm leading-relaxed text-text-muted">
            {identity.vision}
          </p>
        ) : null}
        {(identity.values?.length ?? 0) > 0 ? (
          <ul className="mt-4 flex flex-wrap gap-1.5">
            {identity.values!.map((value) => (
              <li
                key={value}
                className="rounded-full border border-border-subtle bg-surface px-2.5 py-0.5 text-caption text-text-secondary"
              >
                {value}
              </li>
            ))}
          </ul>
        ) : null}
        {canManage ? (
          <div className="mt-5" {...tourTarget(TOUR_TARGETS.orgIdentityPanel)}>
            <IdentityForm orgSlug={orgSlug} identity={identity} />
          </div>
        ) : null}
      </Panel>

      {/* ---- Health + membership ------------------------------------------- */}
      <div className="grid gap-x-6 gap-y-8 lg:grid-cols-2">
        {nova ? (
          <section aria-label="Knowledge health">
            <SectionHeader
              title="Knowledge health"
              action={
                <Link
                  href={`${base}/intelligence`}
                  className="flex items-center gap-1 text-label text-text-muted transition-colors duration-[var(--motion-fast)] hover:text-accent"
                >
                  Open Intelligence
                  <IconArrowRight size={12} />
                </Link>
              }
            />
            <Panel
              tone="outlined"
              className="mt-3 divide-y divide-border-subtle"
            >
              {nova.scorecard.slice(0, 4).map((dim) => (
                <Link
                  key={dim.key}
                  href={dim.href ?? `${base}/intelligence`}
                  className="flex items-center gap-3 px-4 py-2.5 transition-colors duration-[var(--motion-fast)] hover:bg-surface-interactive"
                >
                  <span className="min-w-0 flex-1 truncate text-body-sm text-text-secondary">
                    {dim.label}
                  </span>
                  <span className="text-caption tabular-nums text-text-muted">
                    {dim.pct === null ? "no data" : `${dim.n} of ${dim.m}`}
                  </span>
                  <span className="w-12 text-right text-body-sm font-semibold tabular-nums text-text-primary">
                    {dim.pct === null ? "—" : `${dim.pct}%`}
                  </span>
                </Link>
              ))}
            </Panel>
          </section>
        ) : null}

        <section aria-label="Membership">
          <SectionHeader
            title="Members"
            action={
              can(ctx, "org.members.manage") ? (
                <Link
                  href={`${base}/members`}
                  className="flex items-center gap-1 text-label text-text-muted transition-colors duration-[var(--motion-fast)] hover:text-accent"
                >
                  Manage
                  <IconArrowRight size={12} />
                </Link>
              ) : undefined
            }
          />
          <Panel tone="outlined" className="mt-3 p-4">
            <p className="flex items-baseline gap-2">
              <span className="text-[1.75rem] font-semibold leading-none tracking-tight tabular-nums text-text-primary">
                {hub.members.active}
              </span>
              <span className="text-caption text-text-muted">
                active {hub.members.active === 1 ? "member" : "members"}
                {hub.members.invited > 0
                  ? ` · ${hub.members.invited} invited`
                  : ""}
              </span>
            </p>
            {hub.members.joinedByMonth.length > 0 ? (
              <div className="mt-4">
                <ActivitySparkline
                  data={hub.members.joinedByMonth.map((m) => ({
                    day: m.month,
                    count: m.count,
                  }))}
                  label="Members joined per month"
                />
                <p className="mt-1.5 text-caption text-text-muted">
                  Joins per month since the organization started
                </p>
              </div>
            ) : null}
          </Panel>
        </section>
      </div>

      {/* ---- Living timeline + recent publishing ---------------------------- */}
      <div className="grid gap-x-6 gap-y-8 lg:grid-cols-2">
        <section aria-label="Organization timeline">
          <SectionHeader
            title="Timeline"
            description="The organization's history on the platform — every entry a real dated record"
          />
          <Panel tone="outlined" className="mt-3 p-4">
            {hub.timeline.length === 0 ? (
              <p className="text-body-sm text-text-muted">
                History accrues as the organization builds.
              </p>
            ) : (
              <ol className="space-y-0">
                {hub.timeline.map((entry, i) => (
                  <li
                    key={entry.id}
                    className="relative flex gap-3 pb-4 last:pb-0"
                  >
                    <span className="flex flex-col items-center">
                      <span
                        aria-hidden
                        className={
                          i === 0
                            ? "mt-1 h-2 w-2 shrink-0 rounded-full bg-accent"
                            : "mt-1 h-2 w-2 shrink-0 rounded-full bg-border-strong"
                        }
                      />
                      {i < hub.timeline.length - 1 ? (
                        <span
                          aria-hidden
                          className="mt-1 w-px flex-1 bg-border-subtle"
                        />
                      ) : null}
                    </span>
                    <div className="min-w-0 pb-0.5">
                      <p className="text-body-sm text-text-primary">
                        {entry.title}
                      </p>
                      <p className="text-caption text-text-muted">
                        {entry.detail ? <>{entry.detail} · </> : null}
                        {new Date(entry.at).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Panel>
        </section>

        <section aria-label="Recent publishing">
          <SectionHeader
            title="Recent publishing"
            description={`The newest knowledge live for ${term("learner").plural.toLowerCase()}`}
          />
          <Panel tone="outlined" className="mt-3">
            {hub.recentPublishing.length === 0 ? (
              <p className="px-4 py-5 text-body-sm text-text-muted">
                Published lessons appear here the moment they go live.
              </p>
            ) : (
              <ul className="divide-y divide-border-subtle">
                {hub.recentPublishing.map((v) => (
                  <li
                    key={v.id}
                    className="flex items-center gap-3 px-4 py-2.5"
                  >
                    <span className="min-w-0 flex-1 truncate text-body-sm text-text-primary">
                      {v.title}
                    </span>
                    <span className="shrink-0 text-caption text-text-muted">
                      {relativeTime(v.publishedAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          {(identity.principles?.length ?? 0) > 0 ? (
            <Panel tone="outlined" className="mt-4 p-4">
              <h3 className="text-label font-medium uppercase tracking-[var(--tracking-caps)] text-text-muted">
                Operating principles
              </h3>
              <ul className="mt-2 space-y-1">
                {identity.principles!.map((p) => (
                  <li
                    key={p}
                    className="flex items-start gap-2 text-body-sm text-text-secondary"
                  >
                    <span
                      aria-hidden
                      className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-accent"
                    />
                    {p}
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}
        </section>
      </div>
    </div>
  );
}
