import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

vi.mock("@/lib/actions/learning", () => ({
  createLessonAction: vi.fn(async () => ({ ok: true })),
  createModuleAction: vi.fn(async () => ({ ok: true })),
  publishCourseAction: vi.fn(async () => ({ ok: true })),
  swapPositionsAction: vi.fn(async () => ({ ok: true })),
}));

import { PublishCoursePanel } from "./course-builder";

const modules = [{ id: "m1", title: "Foundations", position: "a0" }];

describe("course publish panel", () => {
  test("lists the exact lesson versions the new course version will pin", () => {
    render(
      <PublishCoursePanel
        orgSlug="alpha-learning"
        courseId="c1"
        courseTitle="Onboarding"
        modules={modules}
        lessons={[
          {
            id: "l1",
            moduleId: "m1",
            title: "Welcome",
            position: "a0",
            required: true,
            publishedVersionNumber: 3,
          },
          {
            id: "l2",
            moduleId: "m1",
            title: "Setup",
            position: "a1",
            required: true,
            publishedVersionNumber: 1,
          },
        ]}
        nextVersionNumber={4}
      />,
    );
    const list = screen.getByRole("list", {
      name: /exact versions that will be pinned/i,
    });
    expect(list).toHaveTextContent("→ pins v3");
    expect(list).toHaveTextContent("→ pins v1");
    expect(
      screen.getByRole("button", { name: /publish version 4/i }),
    ).toBeEnabled();
  });

  test("an unpublished lesson blocks publication and is named", () => {
    render(
      <PublishCoursePanel
        orgSlug="alpha-learning"
        courseId="c1"
        courseTitle="Onboarding"
        modules={modules}
        lessons={[
          {
            id: "l1",
            moduleId: "m1",
            title: "Welcome",
            position: "a0",
            required: true,
            publishedVersionNumber: 2,
          },
          {
            id: "l2",
            moduleId: "m1",
            title: "Draft Only",
            position: "a1",
            required: true,
            publishedVersionNumber: null,
          },
        ]}
        nextVersionNumber={1}
      />,
    );
    expect(screen.getByText(/no published version/i)).toBeInTheDocument();
    expect(
      screen.getByText(/publish these lessons first: draft only/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /publish version 1/i }),
    ).toBeDisabled();
  });

  test("a course with no lessons cannot publish", () => {
    render(
      <PublishCoursePanel
        orgSlug="alpha-learning"
        courseId="c1"
        courseTitle="Empty"
        modules={modules}
        lessons={[]}
        nextVersionNumber={1}
      />,
    );
    expect(screen.getByText(/add at least one lesson/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /publish version 1/i }),
    ).toBeDisabled();
  });
});
