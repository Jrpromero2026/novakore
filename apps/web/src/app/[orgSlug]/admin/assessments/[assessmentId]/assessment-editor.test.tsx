import { render, screen } from "@testing-library/react";
import userEventImport from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import type { AssessmentDetail } from "@/lib/data/assessments";

vi.mock("@/lib/actions/assessments", () => ({
  archiveAssignmentAction: vi.fn(async () => ({ ok: true })),
  assignAssessmentAction: vi.fn(async () => ({ ok: true })),
  publishAssessmentAction: vi.fn(async () => ({ ok: true })),
  saveAssessmentAction: vi.fn(async () => ({ ok: true })),
}));

import { AssessmentEditor } from "./assessment-editor";

const userEvent =
  (userEventImport as { default?: typeof userEventImport }).default ??
  userEventImport;

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function makeDetail(
  overrides: Partial<AssessmentDetail> = {},
): AssessmentDetail {
  return {
    id: id(1),
    title: "Safety Quiz",
    assessmentType: "quiz",
    status: "draft",
    settings: {
      schemaVersion: 1,
      passingPercent: 70,
      cooldownMinutes: 0,
      scorePolicy: "highest",
    },
    currentPublishedVersionId: null,
    publishedVersionNumber: null,
    publishedAt: null,
    items: [
      {
        id: id(2),
        type: "true_false",
        schemaVersion: 1,
        data: {
          prompt: "Server grading is authoritative.",
          correctValue: true,
          points: 5,
        },
        position: "a0",
        required: true,
      },
    ],
    assignments: [],
    attempts: [],
    ...overrides,
  };
}

function renderEditor(detail: AssessmentDetail, canPublish: boolean) {
  return render(
    <AssessmentEditor
      orgSlug="alpha-learning"
      detail={detail}
      canPublish={canPublish}
      canAssign={true}
      lessons={[{ id: id(9), title: "Lesson", courseTitle: "Course" }]}
      lessonTerm="Lesson"
    />,
  );
}

describe("assessment editor", () => {
  test("authors without publish access see no publish control", () => {
    renderEditor(makeDetail(), false);
    expect(
      screen.queryByRole("button", { name: /publish version/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/publishing requires publish access/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save draft/i })).toBeEnabled();
  });

  test("publishers see the next immutable version number", () => {
    renderEditor(
      makeDetail({
        publishedVersionNumber: 2,
        publishedAt: "2026-07-28T12:00:00Z",
      }),
      true,
    );
    expect(
      screen.getByRole("button", { name: /publish version 3/i }),
    ).toBeEnabled();
    expect(screen.getByText(/published v2/i)).toBeInTheDocument();
  });

  test("an invalid item is flagged inline and blocks saving and publishing", async () => {
    renderEditor(makeDetail(), true);
    await userEvent.clear(screen.getByLabelText(/^prompt$/i));
    expect(screen.getByText(/^invalid$/i)).toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save draft/i })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /publish version 1/i }),
    ).toBeDisabled();
  });

  test("out-of-bounds settings block saving with an explanation", async () => {
    renderEditor(makeDetail(), true);
    const passing = screen.getByLabelText(/passing percent/i);
    await userEvent.clear(passing);
    await userEvent.type(passing, "0");
    expect(screen.getByText(/settings are out of bounds/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save draft/i })).toBeDisabled();
  });

  test("assignment attach requires a published version", () => {
    renderEditor(makeDetail(), true);
    expect(
      screen.getByText(/publish a version before attaching/i),
    ).toBeInTheDocument();
  });

  test("assignments display the exact pinned version", () => {
    renderEditor(
      makeDetail({
        currentPublishedVersionId: id(20),
        publishedVersionNumber: 1,
        publishedAt: "2026-07-28T12:00:00Z",
        assignments: [
          {
            id: id(21),
            lessonId: id(9),
            lessonTitle: "Gated Lesson",
            courseTitle: "Flow Course",
            versionNumber: 1,
            required: true,
            status: "active",
          },
        ],
      }),
      true,
    );
    expect(screen.getByText(/pins v1/i)).toBeInTheDocument();
    expect(screen.getByText(/flow course · gated lesson/i)).toBeInTheDocument();
  });
});
