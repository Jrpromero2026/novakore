"use client";

import { useState, useTransition } from "react";
import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_SEVERITIES,
  FEEDBACK_STATUSES,
  feedbackCategoryLabel,
} from "@/lib/feedback";
import { updateFeedbackAction } from "@/lib/actions/feedback";
import type { FeedbackRow } from "@/lib/data/ops";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Input,
  Select,
  Textarea,
} from "@/components/ui/primitives";

const statusTone: Record<
  string,
  "neutral" | "accent" | "positive" | "warning"
> = {
  new: "warning",
  triaged: "accent",
  in_progress: "accent",
  resolved: "positive",
  archived: "neutral",
};

export function FeedbackReview({
  orgSlug,
  rows,
  filters,
  basePath,
}: {
  orgSlug: string;
  rows: FeedbackRow[];
  filters: {
    status?: string;
    category?: string;
    severity?: string;
    q?: string;
  };
  basePath: string;
}) {
  return (
    <Card>
      <CardHeader
        title="Feedback"
        description={`${rows.length} item${rows.length === 1 ? "" : "s"} (newest first)`}
      />
      <form method="get" action={basePath} className="flex flex-wrap gap-2 p-4">
        <Select
          name="status"
          defaultValue={filters.status ?? ""}
          className="w-auto"
        >
          <option value="">All statuses</option>
          {FEEDBACK_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, " ")}
            </option>
          ))}
        </Select>
        <Select
          name="category"
          defaultValue={filters.category ?? ""}
          className="w-auto"
        >
          <option value="">All types</option>
          {FEEDBACK_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </Select>
        <Select
          name="severity"
          defaultValue={filters.severity ?? ""}
          className="w-auto"
        >
          <option value="">Any severity</option>
          {FEEDBACK_SEVERITIES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
        <Input
          name="q"
          defaultValue={filters.q ?? ""}
          placeholder="Search message…"
          className="w-auto flex-1"
        />
        <Button type="submit" variant="secondary">
          Filter
        </Button>
      </form>

      {rows.length ? (
        <ul className="divide-y divide-border-subtle">
          {rows.map((row) => (
            <FeedbackRowItem key={row.id} orgSlug={orgSlug} row={row} />
          ))}
        </ul>
      ) : (
        <p className="px-5 py-8 text-center text-body-sm text-text-muted">
          No feedback matches these filters.
        </p>
      )}
    </Card>
  );
}

function FeedbackRowItem({
  orgSlug,
  row,
}: {
  orgSlug: string;
  row: FeedbackRow;
}) {
  const [status, setStatus] = useState(row.status);
  const [severity, setSeverity] = useState(row.severity ?? "");
  const [notes, setNotes] = useState(row.notes ?? "");
  const [resolution, setResolution] = useState(row.resolution ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const ctx = row.context ?? {};
  const route = typeof ctx.route === "string" ? ctx.route : null;
  const roleHint = typeof ctx.roleHint === "string" ? ctx.roleHint : null;

  function save() {
    startTransition(async () => {
      const result = await updateFeedbackAction(orgSlug, row.id, {
        status,
        severity: severity || null,
        notes: notes || null,
        resolution: resolution || null,
      });
      setMsg(result.ok ? "Saved" : (result.message ?? "Error"));
    });
  }

  return (
    <li className="space-y-3 px-5 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="neutral">{feedbackCategoryLabel(row.category)}</Badge>
        {row.severity ? <Badge tone="danger">{row.severity}</Badge> : null}
        <Badge tone={statusTone[row.status] ?? "neutral"}>
          {row.status.replace(/_/g, " ")}
        </Badge>
        <span className="ml-auto text-caption text-text-muted">
          {new Date(row.createdAt).toLocaleString()}
        </span>
      </div>

      <p className="whitespace-pre-wrap text-body-sm text-text">
        {row.message}
      </p>

      <p className="text-caption text-text-muted">
        {row.submitterEmail ? `${row.submitterEmail} · ` : ""}
        {roleHint ? `${roleHint} · ` : ""}
        {route ? <span className="font-mono">{route}</span> : "no route"}
      </p>

      <div className="grid gap-2 sm:grid-cols-2">
        <Select value={status} onChange={(e) => setStatus(e.target.value)}>
          {FEEDBACK_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, " ")}
            </option>
          ))}
        </Select>
        <Select value={severity} onChange={(e) => setSeverity(e.target.value)}>
          <option value="">No severity</option>
          {FEEDBACK_SEVERITIES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
      </div>
      <Textarea
        rows={2}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Internal triage notes…"
      />
      <Textarea
        rows={2}
        value={resolution}
        onChange={(e) => setResolution(e.target.value)}
        placeholder="Resolution (what was done)…"
      />
      <div className="flex items-center gap-3">
        <Button disabled={pending} onClick={save}>
          {pending ? "Saving…" : "Save"}
        </Button>
        {msg ? (
          <span className="text-caption text-text-muted">{msg}</span>
        ) : null}
      </div>
    </li>
  );
}
