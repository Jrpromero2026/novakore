"use client";

import { useActionState, useState, useTransition } from "react";
import {
  assignRoleAction,
  inviteMemberAction,
  revokeRoleAction,
  setMembershipStatusAction,
} from "@/lib/actions/members";
import { idle, type ActionState } from "@/lib/actions/types";
import {
  ActionBanner,
  Badge,
  Button,
  Card,
  CardHeader,
  Field,
  Input,
  Select,
  cx,
} from "@/components/ui/primitives";
import { ConfirmButton } from "@/components/ui/feedback";
import { tourTarget, TOUR_TARGETS } from "@/lib/onboarding/targets";

export function InvitePanel({ orgSlug }: { orgSlug: string }) {
  const [state, action, pending] = useActionState(
    inviteMemberAction.bind(null, orgSlug),
    idle,
  );

  return (
    <Card>
      <CardHeader
        title="Invite a member"
        description="They join after signing in with this email and accepting the invitation."
      />
      <form
        action={action}
        className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-end"
      >
        <div className="flex-1">
          <Field
            label="Email address"
            htmlFor="invite-email"
            error={state.errors?.email}
          >
            <Input
              id="invite-email"
              name="email"
              type="email"
              placeholder="name@example.com"
              required
              {...tourTarget(TOUR_TARGETS.inviteEmailField)}
            />
          </Field>
        </div>
        <Button
          type="submit"
          disabled={pending}
          {...tourTarget(TOUR_TARGETS.inviteSubmitButton)}
        >
          {pending ? "Inviting…" : "Send invitation"}
        </Button>
      </form>
      <div className="px-5 pb-4 empty:hidden">
        <ActionBanner state={state} />
      </div>
    </Card>
  );
}

interface Assignment {
  id: string;
  academyId: string | null;
  roleName: string;
  roleKey: string;
}

interface MembershipView {
  id: string;
  status: string;
  invitedEmail: string | null;
  userId: string | null;
  assignments: Assignment[];
}

const statusTone = {
  active: "positive",
  invited: "accent",
  suspended: "warning",
} as const;

export function MemberRow({
  orgSlug,
  membership,
  roles,
  academies,
  isSelf,
}: {
  orgSlug: string;
  membership: MembershipView;
  roles: { id: string; name: string; key: string }[];
  academies: { id: string; name: string }[];
  isSelf: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [feedback, setFeedback] = useState<ActionState>(idle);
  const [pending, startTransition] = useTransition();
  const [roleId, setRoleId] = useState(roles[0]?.id ?? "");
  const [academyId, setAcademyId] = useState<string>("");

  const run = (fn: () => Promise<ActionState>) =>
    startTransition(async () => setFeedback(await fn()));

  const label = membership.invitedEmail ?? membership.userId ?? "member";
  const academyName = (id: string | null) =>
    id === null
      ? null
      : (academies.find((a) => a.id === id)?.name ?? "academy");

  return (
    <li className="px-5 py-3.5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-text">
            {label}
            {isSelf ? (
              <span className="ml-2 text-xs text-text-faint">(you)</span>
            ) : null}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Badge
              tone={
                statusTone[membership.status as keyof typeof statusTone] ??
                "neutral"
              }
            >
              {membership.status}
            </Badge>
            {membership.assignments.map((a) => (
              <span
                key={a.id}
                className="inline-flex items-center gap-1 rounded-full bg-surface-sunken px-2 py-0.5 text-[11px] text-text-muted"
              >
                {a.roleName}
                {a.academyId ? (
                  <span className="text-text-faint">
                    · {academyName(a.academyId)}
                  </span>
                ) : null}
                <button
                  type="button"
                  aria-label={`Revoke ${a.roleName}`}
                  disabled={pending}
                  onClick={() => run(() => revokeRoleAction(orgSlug, a.id))}
                  className="text-text-faint hover:text-danger"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {membership.status !== "invited" ? (
            <Button
              variant="ghost"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              className="text-xs"
            >
              Assign role
            </Button>
          ) : null}
          {membership.status === "active" && !isSelf ? (
            <Button
              variant="secondary"
              disabled={pending}
              className="text-xs"
              onClick={() =>
                run(() =>
                  setMembershipStatusAction(
                    orgSlug,
                    membership.id,
                    "suspended",
                  ),
                )
              }
            >
              Suspend
            </Button>
          ) : null}
          {membership.status === "suspended" && !isSelf ? (
            <Button
              variant="secondary"
              disabled={pending}
              className="text-xs"
              onClick={() =>
                run(() =>
                  setMembershipStatusAction(orgSlug, membership.id, "active"),
                )
              }
            >
              Reactivate
            </Button>
          ) : null}
          {!isSelf ? (
            <ConfirmButton
              label={
                membership.status === "invited" ? "Revoke invite" : "Remove"
              }
              confirmLabel={
                membership.status === "invited"
                  ? "Revoke it"
                  : "Remove permanently"
              }
              description={
                membership.status === "invited"
                  ? "This invitation will stop working."
                  : "Removal is permanent history and ends their access."
              }
              disabled={pending}
              className="text-xs"
              onConfirm={() =>
                run(() =>
                  setMembershipStatusAction(orgSlug, membership.id, "removed"),
                )
              }
            />
          ) : null}
        </div>
      </div>

      {open ? (
        <div
          className={cx(
            "mt-3 flex flex-wrap items-end gap-3 rounded-md border border-border bg-surface-sunken p-3",
          )}
        >
          <div className="min-w-40">
            <label
              htmlFor={`role-${membership.id}`}
              className="mb-1 block text-xs font-medium text-text-muted"
            >
              Role
            </label>
            <Select
              id={`role-${membership.id}`}
              value={roleId}
              onChange={(e) => setRoleId(e.target.value)}
            >
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="min-w-40">
            <label
              htmlFor={`academy-${membership.id}`}
              className="mb-1 block text-xs font-medium text-text-muted"
            >
              Scope
            </label>
            <Select
              id={`academy-${membership.id}`}
              value={academyId}
              onChange={(e) => setAcademyId(e.target.value)}
            >
              <option value="">Organization-wide</option>
              {academies.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} only
                </option>
              ))}
            </Select>
          </div>
          <Button
            disabled={pending || !roleId}
            onClick={() =>
              run(() =>
                assignRoleAction(orgSlug, {
                  membershipId: membership.id,
                  roleId,
                  academyId: academyId === "" ? null : academyId,
                }),
              )
            }
          >
            Assign
          </Button>
        </div>
      ) : null}

      <div className="mt-2 empty:hidden">
        <ActionBanner state={feedback} />
      </div>
    </li>
  );
}
