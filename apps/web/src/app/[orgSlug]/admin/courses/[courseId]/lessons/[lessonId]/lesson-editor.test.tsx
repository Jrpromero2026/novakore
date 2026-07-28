import { render, screen } from "@testing-library/react";
import userEventImport from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import type { ContentBlock } from "@novakore/domain";

vi.mock("@/lib/actions/learning", () => ({
  publishLessonAction: vi.fn(async () => ({ ok: true })),
  saveLessonBlocksAction: vi.fn(async () => ({ ok: true })),
}));

import { LessonEditor } from "./lesson-editor";

const userEvent =
  (userEventImport as { default?: typeof userEventImport }).default ??
  userEventImport;

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const textBlock: ContentBlock = {
  id: id(1),
  type: "rich_text",
  schemaVersion: 1,
  position: "a0",
  data: { text: "Welcome to the lesson." },
};

function renderEditor({
  canPublish,
  published = null,
  comparison = null,
}: {
  canPublish: boolean;
  published?: { versionNumber: number; publishedAt: string } | null;
  comparison?: {
    added: number;
    removed: number;
    changed: number;
    titleChanged: boolean;
  } | null;
}) {
  return render(
    <LessonEditor
      orgSlug="alpha-learning"
      lessonId={id(9)}
      initialBlocks={[textBlock]}
      canPublish={canPublish}
      published={published}
      comparison={comparison}
    />,
  );
}

describe("lesson editor", () => {
  test("authors without publish access can draft but see no publish control", () => {
    renderEditor({ canPublish: false });
    expect(
      screen.queryByRole("button", { name: /publish lesson/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/publishing requires publish access/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save draft/i })).toBeEnabled();
  });

  test("publishers get the publish control", () => {
    renderEditor({ canPublish: true });
    expect(
      screen.getByRole("button", { name: /publish lesson/i }),
    ).toBeEnabled();
  });

  test("shows the exact published version and the draft comparison", () => {
    renderEditor({
      canPublish: true,
      published: { versionNumber: 2, publishedAt: "2026-07-01T12:00:00Z" },
      comparison: { added: 1, removed: 0, changed: 2, titleChanged: false },
    });
    expect(screen.getByText(/published v2/i)).toBeInTheDocument();
    expect(
      screen.getByText(/draft vs v2: \+1 added, −0 removed, 2 changed/i),
    ).toBeInTheDocument();
  });

  test("an invalid block is flagged inline and blocks saving", async () => {
    renderEditor({ canPublish: true });
    await userEvent.clear(screen.getByLabelText(/text content/i));
    expect(screen.getByText(/^invalid$/i)).toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save draft/i })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /publish lesson/i }),
    ).toBeDisabled();
  });
});
