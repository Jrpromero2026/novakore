"use client";

import { useState, useTransition } from "react";
import {
  createEnrollmentAction,
  overrideProgressAction,
  setEnrollmentStatusAction,
} from "@/lib/actions/learning";
import { idle, type ActionState } from "@/lib/actions/types";
import {
  ActionBanner,
  Badge,
  Button,
  Card,
  CardHeader,
  Input,
  Select,
} from "@/components/ui/primitives";
import { ConfirmButton } from "@/components/ui/feedback";

export function CreateEnrollmentPanel({
  orgSlug,
  members,
  courses,
  paths,
  courseTerm,
  pathTerm,
}: {
  orgSlug: string;
  members: { id: string; email: string }[];
  courses: { id: string; title: string }[];
  paths: { id: string; title: string }[];
  courseTerm: string;
  pathTerm: string;
}) {
  const [membershipId, setMembershipId] = useState("");
  const [target, setTarget] = useState("");
  const [state, setState] = useState<ActionState>(idle);
  const [pending, startTransition] = useTransition();

  return (
    <Card>
      <CardHeader
        title="Assign learning"
        description={`${courseTerm} enrollments pin the current published version immediately.`}
      />
      <div className="flex flex-wrap items-end gap-3 px-5 py-4">
        <div className="min-w-56">
          <label
            htmlFor="enroll-member"
            className="mb-1 block text-label text-text-secondary"
          >
            Member
          </label>
          <Select
            id="enroll-member"
            value={membershipId}
            onChange={(e) => setMembershipId(e.target.value)}
          >
            <option value="">Choose…</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.email}
              </option>
            ))}
          </Select>
        </div>
        <div className="min-w-64">
          <label
            htmlFor="enroll-target"
            className="mb-1 block text-label text-text-secondary"
          >
            Target
          </label>
          <Select
            id="enroll-target"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          >
            <option value="">Choose…</option>
            <optgroup label={`${pathTerm}s`}>
              {paths.map((p) => (
                <option key={p.id} value={`learning_path:${p.id}`}>
                  {p.title}
                </option>
              ))}
            </optgroup>
            <optgroup label={`${courseTerm}s (published)`}>
              {courses.map((c) => (
                <option key={c.id} value={`course:${c.id}`}>
                  {c.title}
                </option>
              ))}
            </optgroup>
          </Select>
        </div>
        <Button
          disabled={pending || !membershipId || !target}
          onClick={() =>
            startTransition(async () => {
              const [targetType, targetId] = target.split(":") as [
                "course" | "learning_path",
                string,
              ];
              setState(
                await createEnrollmentAction(orgSlug, {
                  membershipId,
                  targetType,
                  targetId,
                }),
              );
            })
          }
        >
          {pending ? "Assigning…" : "Assign"}
        </Button>
      </div>
      <div className="px-5 pb-4 empty:hidden">
        <ActionBanner state={state} />
      </div>
    </Card>
  );
}

const statusTone = {
  active: "positive",
  completed: "accent",
  withdrawn: "neutral",
  expired: "warning",
} as const;

export function EnrollmentRow({
  orgSlug,
  enrollment,
  progress,
  canOverride,
}: {
  orgSlug: string;
  enrollment: {
    id: string;
    memberEmail: string;
    targetTitle: string;
    targetType: string;
    status: string;
    pinned: boolean;
    startedAt: string | null;
    completedAt: string | null;
  };
  progress: {
    lessonId: string;
    lessonTitle: string;
    lessonVersionId: string | null;
    status: string;
    overrideReason: string | null;
  }[];
  canOverride: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<ActionState>(idle);
  const [pending, startTransition] = useTransition();
  const [overrideReason, setOverrideReason] = useState("");

  const run = (fn: () => Promise<ActionState>) =>
    startTransition(async () => setState(await fn()));

  return (
    <li className="px-5 py-3.5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-body-sm font-medium text-text-primary">
            {enrollment.memberEmail}
            <span className="text-text-muted"> → {enrollment.targetTitle}</span>
          </p>
          <p className="text-caption text-text-muted">
            {enrollment.targetType === "course"
              ? enrollment.pinned
                ? "Pinned at enrollment"
                : "Pin missing"
              : "Pins each course at first start"}
            {enrollment.completedAt
              ? ` · completed ${new Date(enrollment.completedAt).toLocaleDateString()}`
              : enrollment.startedAt
                ? ` · started ${new Date(enrollment.startedAt).toLocaleDateString()}`
                : " · not started"}
          </p>
        </div>
        <Badge
          tone={
            statusTone[enrollment.status as keyof typeof statusTone] ??
            "neutral"
          }
        >
          {enrollment.status}
        </Badge>
        <Button
          variant="ghost"
          className="text-xs"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          {open ? "Hide progress" : "Progress"}
        </Button>
        {enrollment.status === "active" ? (
          <ConfirmButton
            label="Withdraw"
            confirmLabel="Withdraw them"
            description="Access ends; evidence is kept."
            className="text-xs"
            disabled={pending}
            onConfirm={() =>
              run(() =>
                setEnrollmentStatusAction(orgSlug, enrollment.id, "withdrawn"),
              )
            }
          />
        ) : null}
      </div>

      {open ? (
        <div className="mt-3 space-y-2 rounded-md border border-border-subtle bg-background-subtle p-3">
          {progress.length === 0 ? (
            <p className="text-caption text-text-muted">
              No lesson progress yet.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {progress.map((p) => (
                <li
                  key={p.lessonId}
                  className="flex flex-wrap items-center gap-2 text-body-sm text-text-primary"
                >
                  {p.lessonTitle}
                  <Badge
                    tone={
                      p.status === "completed"
                        ? "positive"
                        : p.status === "exempted"
                          ? "accent"
                          : "neutral"
                    }
                  >
                    {p.status}
                  </Badge>
                  {p.overrideReason ? (
                    <span className="text-caption text-warning">
                      override: {p.overrideReason}
                    </span>
                  ) : null}
                  <span className="font-mono text-caption text-text-faint">
                    {p.lessonVersionId ?? ""}
                  </span>
                  {canOverride && p.status !== "completed" ? (
                    <span className="ml-auto flex items-center gap-1.5">
                      <label
                        htmlFor={`reason-${enrollment.id}-${p.lessonId}`}
                        className="sr-only"
                      >
                        Override reason
                      </label>
                      <Input
                        id={`reason-${enrollment.id}-${p.lessonId}`}
                        placeholder="Override reason…"
                        className="h-8 w-44 text-xs"
                        value={overrideReason}
                        onChange={(e) => setOverrideReason(e.target.value)}
                      />
                      <Button
                        variant="secondary"
                        className="text-xs"
                        disabled={pending || overrideReason.trim().length < 5}
                        onClick={() =>
                          run(() =>
                            overrideProgressAction(orgSlug, {
                              enrollmentId: enrollment.id,
                              lessonId: p.lessonId,
                              status: "completed",
                              reason: overrideReason,
                            }),
                          )
                        }
                      >
                        Mark complete
                      </Button>
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      <div className="mt-2 empty:hidden">
        <ActionBanner state={state} />
      </div>
    </li>
  );
}
