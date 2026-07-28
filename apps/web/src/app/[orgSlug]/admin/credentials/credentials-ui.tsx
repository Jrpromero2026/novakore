"use client";

import { useActionState, useState, useTransition } from "react";
import {
  createCertificateAction,
  createTemplateAction,
  revokeCredentialAction,
} from "@/lib/actions/assessments";
import { idle, type ActionState } from "@/lib/actions/types";
import type { CredentialAdminData } from "@/lib/data/assessments";
import {
  ActionBanner,
  Badge,
  Button,
  Card,
  CardHeader,
  Field,
  Input,
  Select,
  Textarea,
} from "@/components/ui/primitives";

export function CredentialsAdmin({
  orgSlug,
  data,
  canRevoke,
  sources,
}: {
  orgSlug: string;
  data: CredentialAdminData;
  canRevoke: boolean;
  sources: { value: string; label: string }[];
}) {
  const [templateState, templateAction, templatePending] = useActionState(
    createTemplateAction.bind(null, orgSlug),
    idle,
  );
  const [certState, certAction, certPending] = useActionState(
    createCertificateAction.bind(null, orgSlug),
    idle,
  );
  const [revokeState, setRevokeState] = useState<ActionState>(idle);
  const [revokeTarget, setRevokeTarget] = useState<string | null>(null);
  const [revokeReason, setRevokeReason] = useState("");
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title={`Templates (${data.templates.length})`}
          description="Constrained plain-text schema rendered through your organization theme — no design canvas."
        />
        <ul className="divide-y divide-border-subtle">
          {data.templates.map((t) => (
            <li
              key={t.id}
              className="flex items-center gap-3 px-5 py-3 text-body-sm"
            >
              <span className="flex-1 text-text-primary">{t.name}</span>
              <Badge tone={t.status === "active" ? "positive" : "neutral"}>
                {t.status}
              </Badge>
            </li>
          ))}
        </ul>
        <form
          action={templateAction}
          className="grid gap-3 border-t border-border-subtle px-5 py-4 sm:grid-cols-2"
        >
          <Field label="Template name" htmlFor="tpl-name">
            <Input id="tpl-name" name="name" required />
          </Field>
          <Field label="Certificate headline" htmlFor="tpl-title">
            <Input
              id="tpl-title"
              name="certTitle"
              placeholder="Certificate of Completion"
              required
            />
          </Field>
          <Field label="Subtitle (optional)" htmlFor="tpl-subtitle">
            <Input id="tpl-subtitle" name="subtitle" />
          </Field>
          <Field label="Expires after (months, optional)" htmlFor="tpl-exp">
            <Input
              id="tpl-exp"
              name="expirationMonths"
              type="number"
              min={1}
              max={120}
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Body text (optional)" htmlFor="tpl-body">
              <Textarea id="tpl-body" name="bodyText" rows={2} />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <ActionBanner state={templateState} />
          </div>
          <div>
            <Button
              type="submit"
              variant="secondary"
              disabled={templatePending}
            >
              {templatePending ? "Creating…" : "Create template"}
            </Button>
          </div>
        </form>
      </Card>

      <Card>
        <CardHeader
          title={`Certificate rules (${data.certificates.length})`}
          description="One active rule per source. Completion or a passed attempt issues the credential automatically and idempotently."
        />
        <ul className="divide-y divide-border-subtle">
          {data.certificates.map((c) => (
            <li
              key={c.id}
              className="flex items-center gap-3 px-5 py-3 text-body-sm"
            >
              <span className="flex-1 text-text-primary">{c.title}</span>
              <Badge tone="neutral">{c.sourceType.replace(/_/g, " ")}</Badge>
              <Badge tone={c.status === "active" ? "positive" : "neutral"}>
                {c.status}
              </Badge>
            </li>
          ))}
        </ul>
        <form
          action={certAction}
          className="grid gap-3 border-t border-border-subtle px-5 py-4 sm:grid-cols-3"
        >
          <Field
            label="Credential title"
            htmlFor="cert-title"
            error={certState.errors?.title}
          >
            <Input id="cert-title" name="title" required />
          </Field>
          <Field label="Template" htmlFor="cert-template">
            <Select
              id="cert-template"
              name="templateId"
              required
              defaultValue=""
            >
              <option value="">Choose…</option>
              {data.templates
                .filter((t) => t.status === "active")
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="Awarded for" htmlFor="cert-source">
            <Select id="cert-source" name="source" required defaultValue="">
              <option value="">Choose…</option>
              {sources.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>
          <div className="sm:col-span-3">
            <ActionBanner state={certState} />
          </div>
          <div>
            <Button type="submit" variant="secondary" disabled={certPending}>
              {certPending ? "Creating…" : "Create rule"}
            </Button>
          </div>
        </form>
      </Card>

      <Card>
        <CardHeader
          title={`Issued credentials (${data.issued.length})`}
          description="Immutable evidence. Revocation is permanent, audited, and requires a reason."
        />
        <ul className="divide-y divide-border-subtle">
          {data.issued.map((cred) => (
            <li key={cred.id} className="space-y-2 px-5 py-3">
              <div className="flex flex-wrap items-center gap-3 text-body-sm">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-text-primary">
                    {cred.title} — {cred.recipientName}
                  </span>
                  <span className="font-mono text-caption text-text-muted">
                    {cred.verificationCode} · issued{" "}
                    {new Date(cred.issuedAt).toLocaleDateString()}
                    {cred.expiresAt
                      ? ` · expires ${new Date(cred.expiresAt).toLocaleDateString()}`
                      : ""}
                  </span>
                </span>
                <Badge
                  tone={
                    cred.status === "active"
                      ? "positive"
                      : cred.status === "revoked"
                        ? "danger"
                        : "warning"
                  }
                >
                  {cred.status}
                </Badge>
                {canRevoke && cred.status === "active" ? (
                  <Button
                    variant="ghost"
                    className="text-xs"
                    onClick={() =>
                      setRevokeTarget(revokeTarget === cred.id ? null : cred.id)
                    }
                  >
                    Revoke…
                  </Button>
                ) : null}
              </div>
              {cred.revocationReason ? (
                <p className="text-caption text-text-muted">
                  Revoked: {cred.revocationReason}
                </p>
              ) : null}
              {revokeTarget === cred.id ? (
                <div className="flex flex-wrap items-end gap-2">
                  <div className="min-w-64 flex-1">
                    <Field
                      label="Revocation reason (required)"
                      htmlFor={`revoke-${cred.id}`}
                    >
                      <Input
                        id={`revoke-${cred.id}`}
                        value={revokeReason}
                        onChange={(e) => setRevokeReason(e.target.value)}
                      />
                    </Field>
                  </div>
                  <Button
                    variant="danger"
                    disabled={pending || revokeReason.trim().length < 5}
                    onClick={() =>
                      startTransition(async () => {
                        setRevokeState(
                          await revokeCredentialAction(
                            orgSlug,
                            cred.id,
                            revokeReason,
                          ),
                        );
                        setRevokeTarget(null);
                        setRevokeReason("");
                      })
                    }
                  >
                    Confirm revoke
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
        <div className="px-5 pb-4 empty:hidden">
          <ActionBanner state={revokeState} />
        </div>
      </Card>
    </div>
  );
}
