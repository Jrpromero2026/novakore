import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import type { ComponentProps } from "react";
import { computeLessonAccess, courseStructureSchema } from "@novakore/domain";
import type { EnrolledCourseView } from "@/lib/data/learning";

vi.mock("next/link", () => ({
  default: (props: ComponentProps<"a">) => <a {...props} />,
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("notFound");
  },
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
}));
vi.mock("@/lib/org-context", () => ({
  requireOrgContext: vi.fn(async () => ({ organization: { id: "org-1" } })),
}));
vi.mock("@/lib/auth", () => ({
  requireUser: vi.fn(async () => ({ id: "user-1" })),
}));
vi.mock("@/lib/terminology", () => ({
  // Tenant overlay: Alpha renames courses/instructors; canonical data unchanged.
  getTerminology: vi.fn(async () => ({
    overrides: {},
    term: (key: string) =>
      key === "course"
        ? { singular: "Sprint", plural: "Sprints" }
        : key === "instructor"
          ? { singular: "Guide", plural: "Guides" }
          : { singular: key, plural: `${key}s` },
  })),
}));
vi.mock("@/lib/data/learning", () => ({
  getEnrolledCourse: vi.fn(),
}));

import { getEnrolledCourse } from "@/lib/data/learning";
import LearnerCoursePage from "./page";

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const structure = courseStructureSchema.parse({
  schemaVersion: 1,
  modules: [
    {
      moduleId: id(10),
      title: "Module One",
      position: "a0",
      lessons: [
        {
          lessonId: id(11),
          lessonVersionId: id(21),
          versionNumber: 1,
          title: "Intro",
          position: "a0",
          required: true,
        },
        {
          lessonId: id(12),
          lessonVersionId: id(22),
          versionNumber: 1,
          title: "Advanced Topics",
          position: "a1",
          required: true,
        },
      ],
    },
  ],
});

function makeView(): EnrolledCourseView {
  return {
    enrollmentId: id(1),
    enrollmentStatus: "active",
    courseId: id(2),
    courseTitle: "Alpha Onboarding",
    versionNumber: 3,
    structure,
    // Access comes from the real domain computation — nothing hand-waved.
    access: computeLessonAccess({
      enrollmentStatus: "active",
      structure,
      progress: [],
    }),
    courseCompleted: false,
    progressByLesson: new Map(),
  };
}

async function renderPage() {
  return render(
    await LearnerCoursePage({
      params: Promise.resolve({
        orgSlug: "alpha-learning",
        enrollmentId: id(1),
        courseId: id(2),
      }),
    }),
  );
}

describe("learner course page", () => {
  test("shows the exact pinned version and the domain lock reason", async () => {
    vi.mocked(getEnrolledCourse).mockResolvedValueOnce(makeView());
    await renderPage();

    expect(
      screen.getByRole("heading", { level: 1, name: "Alpha Onboarding" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/version 3/i)).toBeInTheDocument();

    // First required lesson is open; the next one is locked with the reason.
    expect(screen.getByRole("link", { name: /intro/i })).toHaveAttribute(
      "href",
      expect.stringContaining(`/lessons/${id(11)}`),
    );
    expect(screen.getByText('Complete "Intro" first.')).toBeInTheDocument();
    expect(screen.getByText("Locked")).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /advanced topics/i }),
    ).not.toBeInTheDocument();
  });

  test("tenant terminology is a display overlay on the learner surface", async () => {
    vi.mocked(getEnrolledCourse).mockResolvedValueOnce(makeView());
    await renderPage();
    // Breadcrumb uses the org's word for "course".
    expect(screen.getByText(/\/ sprint/i)).toBeInTheDocument();
  });

  test("missing published version degrades to a safe, termed message", async () => {
    vi.mocked(getEnrolledCourse).mockResolvedValueOnce("version_unavailable");
    await renderPage();
    expect(
      screen.getByText(/this sprint has no published version/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/contact your guide/i)).toBeInTheDocument();
  });
});
