"use client";

import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import {
  createLessonAction,
  createModuleAction,
  publishCourseAction,
  swapPositionsAction,
} from "@/lib/actions/learning";
import { idle, type ActionState } from "@/lib/actions/types";
import {
  ActionBanner,
  Badge,
  Button,
  Card,
  CardHeader,
  Field,
  Input,
} from "@/components/ui/primitives";
import { Alert } from "@/components/ui/feedback";

interface ModuleView {
  id: string;
  title: string;
  position: string;
}
interface LessonView {
  id: string;
  moduleId: string;
  title: string;
  position: string;
  required: boolean;
  publishedVersionNumber: number | null;
}

export function CourseStructurePanel({
  orgSlug,
  courseId,
  modules,
  lessons,
  moduleTerm,
  lessonTerm,
}: {
  orgSlug: string;
  courseId: string;
  modules: ModuleView[];
  lessons: LessonView[];
  moduleTerm: string;
  lessonTerm: string;
}) {
  const [feedback, setFeedback] = useState<ActionState>(idle);
  const [pending, startTransition] = useTransition();
  const [moduleState, moduleAction, modulePending] = useActionState(
    createModuleAction.bind(null, orgSlug, courseId),
    idle,
  );
  const run = (fn: () => Promise<ActionState>) =>
    startTransition(async () => setFeedback(await fn()));

  const sortedModules = [...modules].sort((a, b) =>
    a.position < b.position ? -1 : 1,
  );

  return (
    <Card>
      <CardHeader
        title="Draft structure"
        description={`Reorder with the arrow buttons (keyboard accessible). Every ${lessonTerm.toLowerCase()} needs a published version before the course can publish.`}
      />
      <div className="space-y-4 px-5 py-4">
        {sortedModules.map((module, moduleIndex) => {
          const moduleLessons = lessons
            .filter((l) => l.moduleId === module.id)
            .sort((a, b) => (a.position < b.position ? -1 : 1));
          return (
            <section
              key={module.id}
              className="rounded-md border border-border-default"
            >
              <div className="flex items-center gap-2 border-b border-border-subtle px-4 py-2.5">
                <h3 className="flex-1 text-title text-text-primary">
                  {module.title}
                </h3>
                <Button
                  variant="ghost"
                  className="px-2 text-xs"
                  aria-label={`Move ${module.title} up`}
                  disabled={pending || moduleIndex === 0}
                  onClick={() =>
                    run(() =>
                      swapPositionsAction(
                        orgSlug,
                        "modules",
                        module.id,
                        sortedModules[moduleIndex - 1]!.id,
                      ),
                    )
                  }
                >
                  ↑
                </Button>
                <Button
                  variant="ghost"
                  className="px-2 text-xs"
                  aria-label={`Move ${module.title} down`}
                  disabled={pending || moduleIndex === sortedModules.length - 1}
                  onClick={() =>
                    run(() =>
                      swapPositionsAction(
                        orgSlug,
                        "modules",
                        module.id,
                        sortedModules[moduleIndex + 1]!.id,
                      ),
                    )
                  }
                >
                  ↓
                </Button>
              </div>
              <ol className="divide-y divide-border-subtle">
                {moduleLessons.map((lesson, lessonIndex) => (
                  <li
                    key={lesson.id}
                    className="flex flex-wrap items-center gap-2 px-4 py-2.5"
                  >
                    <Link
                      href={`/${orgSlug}/admin/courses/${courseId}/lessons/${lesson.id}`}
                      className="min-w-0 flex-1 truncate text-body-sm text-text-primary hover:text-accent"
                    >
                      {lesson.title}
                    </Link>
                    {!lesson.required ? (
                      <Badge tone="neutral">optional</Badge>
                    ) : null}
                    <Badge
                      tone={
                        lesson.publishedVersionNumber ? "positive" : "warning"
                      }
                    >
                      {lesson.publishedVersionNumber
                        ? `v${lesson.publishedVersionNumber}`
                        : "unpublished"}
                    </Badge>
                    <span className="flex gap-1">
                      <Button
                        variant="ghost"
                        className="px-2 text-xs"
                        aria-label={`Move ${lesson.title} up`}
                        disabled={pending || lessonIndex === 0}
                        onClick={() =>
                          run(() =>
                            swapPositionsAction(
                              orgSlug,
                              "lessons",
                              lesson.id,
                              moduleLessons[lessonIndex - 1]!.id,
                            ),
                          )
                        }
                      >
                        ↑
                      </Button>
                      <Button
                        variant="ghost"
                        className="px-2 text-xs"
                        aria-label={`Move ${lesson.title} down`}
                        disabled={
                          pending || lessonIndex === moduleLessons.length - 1
                        }
                        onClick={() =>
                          run(() =>
                            swapPositionsAction(
                              orgSlug,
                              "lessons",
                              lesson.id,
                              moduleLessons[lessonIndex + 1]!.id,
                            ),
                          )
                        }
                      >
                        ↓
                      </Button>
                    </span>
                  </li>
                ))}
              </ol>
              <AddLessonRow
                orgSlug={orgSlug}
                courseId={courseId}
                moduleId={module.id}
                lessonTerm={lessonTerm}
              />
            </section>
          );
        })}

        <form
          action={moduleAction}
          className="flex flex-wrap items-end gap-3 rounded-md border border-dashed border-border-strong px-4 py-3"
        >
          <div className="min-w-56 flex-1">
            <Field
              label={`New ${moduleTerm.toLowerCase()} title`}
              htmlFor="new-module-title"
              error={moduleState.errors?.title}
            >
              <Input id="new-module-title" name="title" required />
            </Field>
          </div>
          <Button type="submit" variant="secondary" disabled={modulePending}>
            {modulePending ? "Adding…" : `Add ${moduleTerm.toLowerCase()}`}
          </Button>
        </form>
        <ActionBanner state={feedback} />
      </div>
    </Card>
  );
}

function AddLessonRow({
  orgSlug,
  courseId,
  moduleId,
  lessonTerm,
}: {
  orgSlug: string;
  courseId: string;
  moduleId: string;
  lessonTerm: string;
}) {
  const [state, action, pending] = useActionState(
    createLessonAction.bind(null, orgSlug, courseId, moduleId),
    idle,
  );
  return (
    <form
      action={action}
      className="flex flex-wrap items-end gap-2 border-t border-border-subtle px-4 py-2.5"
    >
      <div className="min-w-48 flex-1">
        <label htmlFor={`new-lesson-${moduleId}`} className="sr-only">
          New {lessonTerm.toLowerCase()} title
        </label>
        <Input
          id={`new-lesson-${moduleId}`}
          name="title"
          placeholder={`New ${lessonTerm.toLowerCase()} title…`}
          required
        />
      </div>
      <Button type="submit" variant="ghost" disabled={pending}>
        {pending ? "Adding…" : `Add ${lessonTerm.toLowerCase()}`}
      </Button>
      {state.errors?.title ? (
        <p role="alert" className="w-full text-caption text-danger">
          {state.errors.title}
        </p>
      ) : null}
    </form>
  );
}

export function PublishCoursePanel({
  orgSlug,
  courseId,
  courseTitle,
  modules,
  lessons,
  nextVersionNumber,
}: {
  orgSlug: string;
  courseId: string;
  courseTitle: string;
  modules: ModuleView[];
  lessons: LessonView[];
  nextVersionNumber: number;
}) {
  const [state, setState] = useState<ActionState>(idle);
  const [pending, startTransition] = useTransition();
  const unpublished = lessons.filter((l) => l.publishedVersionNumber === null);
  const blocked = unpublished.length > 0 || lessons.length === 0;

  return (
    <Card>
      <CardHeader
        title={`Publish ${courseTitle}`}
        description={`Publishing creates immutable version ${nextVersionNumber} pinning the EXACT lesson versions listed below.`}
      />
      <div className="space-y-3 px-5 py-4">
        <ul
          className="space-y-1"
          aria-label="Exact versions that will be pinned"
        >
          {[...modules]
            .sort((a, b) => (a.position < b.position ? -1 : 1))
            .map((m) => (
              <li key={m.id}>
                <p className="text-label text-text-secondary">{m.title}</p>
                <ul className="ml-4 space-y-0.5">
                  {lessons
                    .filter((l) => l.moduleId === m.id)
                    .sort((a, b) => (a.position < b.position ? -1 : 1))
                    .map((l) => (
                      <li
                        key={l.id}
                        className="flex items-center gap-2 text-body-sm text-text-primary"
                      >
                        {l.title}
                        {l.publishedVersionNumber ? (
                          <span className="font-mono text-caption text-text-muted">
                            → pins v{l.publishedVersionNumber}
                          </span>
                        ) : (
                          <span className="text-caption text-danger">
                            no published version
                          </span>
                        )}
                      </li>
                    ))}
                </ul>
              </li>
            ))}
        </ul>

        {blocked ? (
          <Alert tone="warning" title="Not ready">
            {lessons.length === 0
              ? "Add at least one lesson."
              : `Publish these lessons first: ${unpublished.map((l) => l.title).join(", ")}.`}
          </Alert>
        ) : null}

        <ActionBanner state={state} />
        <Button
          disabled={pending || blocked}
          onClick={() =>
            startTransition(async () =>
              setState(await publishCourseAction(orgSlug, courseId)),
            )
          }
        >
          {pending ? "Publishing…" : `Publish version ${nextVersionNumber}`}
        </Button>
      </div>
    </Card>
  );
}
