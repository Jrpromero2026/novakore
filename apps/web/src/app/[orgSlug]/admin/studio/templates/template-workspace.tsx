"use client";

import { useMemo, useState, useTransition } from "react";
import {
  applyTemplateAction,
  archiveTemplateAction,
} from "@/lib/actions/templates";
import { idle, type ActionState } from "@/lib/actions/types";
import type { TemplateSummary } from "@/lib/data/templates";
import {
  ActionBanner,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Input,
  Select,
} from "@/components/ui/primitives";

interface LessonOption {
  id: string;
  title: string;
  courseTitle: string;
}

export function TemplateWorkspace({
  orgSlug,
  templates,
  lessons,
  canManage,
  canAuthor,
}: {
  orgSlug: string;
  templates: TemplateSummary[];
  lessons: LessonOption[];
  canManage: boolean;
  canAuthor: boolean;
}) {
  const [feedback, setFeedback] = useState<ActionState>(idle);
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [lessonId, setLessonId] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        (t.description ?? "").toLowerCase().includes(q),
    );
  }, [templates, query]);

  function openApply(template: TemplateSummary) {
    setFeedback(idle);
    setApplyingId(template.id);
    setValues(Object.fromEntries(template.variables.map((v) => [v.key, ""])));
    setLessonId("");
  }

  function apply(templateId: string) {
    if (!lessonId) return;
    startTransition(async () => {
      const result = await applyTemplateAction(
        orgSlug,
        templateId,
        lessonId,
        values,
      );
      setFeedback(result);
      if (result.ok) setApplyingId(null);
    });
  }

  function archive(templateId: string) {
    startTransition(async () => {
      setFeedback(await archiveTemplateAction(orgSlug, templateId));
    });
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Templates"
          description="A saved shape — several blocks plus the details that change each time. Apply one to a lesson and fill in the blanks."
        />
        <div className="flex flex-wrap items-center gap-2 px-5 pb-4">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search templates"
            aria-label="Search templates"
            className="max-w-xs"
          />
          <span className="text-caption text-text-muted">
            {filtered.length} of {templates.length}
          </span>
        </div>
      </Card>

      {feedback.message ? <ActionBanner state={feedback} /> : null}

      {templates.length === 0 ? (
        <Card>
          <EmptyState
            title="No templates yet"
            description="Write a lesson the way you want every one of its kind to look, put {{placeholders}} where the details change, then save it as a template from the lesson editor."
          />
        </Card>
      ) : (
        <ul className="space-y-3">
          {filtered.map((t) => (
            <li key={t.id}>
              <Card>
                <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-body font-medium text-text">
                        {t.title}
                      </h3>
                      <Badge tone="neutral">{t.category}</Badge>
                    </div>
                    {t.description ? (
                      <p className="mt-1 text-body-sm text-text-secondary">
                        {t.description}
                      </p>
                    ) : null}
                    <p className="mt-1.5 text-caption text-text-muted tabular-nums">
                      {t.blockCount} block{t.blockCount === 1 ? "" : "s"} ·{" "}
                      {t.variables.length} field
                      {t.variables.length === 1 ? "" : "s"} to fill
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {canAuthor ? (
                      <Button
                        variant="secondary"
                        onClick={() => openApply(t)}
                        disabled={pending}
                      >
                        Use
                      </Button>
                    ) : null}
                    {canManage ? (
                      <Button
                        variant="ghost"
                        onClick={() => archive(t.id)}
                        disabled={pending}
                      >
                        Archive
                      </Button>
                    ) : null}
                  </div>
                </div>

                {applyingId === t.id ? (
                  <div className="border-t border-border-subtle px-5 py-4">
                    <div className="space-y-3">
                      <label className="block">
                        <span className="mb-1 block text-caption text-text-muted">
                          Add to lesson
                        </span>
                        <Select
                          value={lessonId}
                          onChange={(e) => setLessonId(e.target.value)}
                        >
                          <option value="">Choose a lesson…</option>
                          {lessons.map((l) => (
                            <option key={l.id} value={l.id}>
                              {l.courseTitle} — {l.title}
                            </option>
                          ))}
                        </Select>
                      </label>

                      {t.variables.length === 0 ? (
                        <p className="text-body-sm text-text-secondary">
                          This template has no fields to fill.
                        </p>
                      ) : (
                        t.variables.map((v) => (
                          <label key={v.key} className="block">
                            <span className="mb-1 block text-caption text-text-muted">
                              {v.label}
                              {v.required ? (
                                <span className="text-danger"> *</span>
                              ) : null}
                            </span>
                            <Input
                              value={values[v.key] ?? ""}
                              onChange={(e) =>
                                setValues((prev) => ({
                                  ...prev,
                                  [v.key]: e.target.value,
                                }))
                              }
                              placeholder={v.help ?? ""}
                            />
                          </label>
                        ))
                      )}

                      <div className="flex gap-2 pt-1">
                        <Button
                          onClick={() => apply(t.id)}
                          disabled={pending || !lessonId}
                        >
                          {pending ? "Adding…" : "Add to lesson"}
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={() => setApplyingId(null)}
                          disabled={pending}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : null}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
