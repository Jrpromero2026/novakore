import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

vi.mock("next/link", () => ({
  default: (props: React.ComponentProps<"a">) => <a {...props} />,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("@/lib/actions/assessments", () => ({
  saveResponseAction: vi.fn(async () => ({ ok: true })),
  startAttemptAction: vi.fn(async () => ({ ok: true })),
  submitAttemptAction: vi.fn(async () => ({ ok: true })),
}));

import { AttemptFlow, type AttemptPayload } from "./attempt-flow";

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const payload: AttemptPayload = {
  attemptId: id(1),
  status: "started",
  attemptNumber: 1,
  expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
  timeLimitMinutes: 10,
  passingPercent: 70,
  title: "Safety Quiz",
  versionNumber: 1,
  items: [
    {
      id: id(2),
      type: "multiple_choice",
      position: "a0",
      required: true,
      prompt: "Which layer grades responses?",
      points: 10,
      options: [
        { id: id(3), text: "The server" },
        { id: id(4), text: "The browser" },
      ],
    },
    {
      id: id(5),
      type: "file_submission",
      position: "a1",
      required: false,
      prompt: "Provide your worksheet.",
      points: 5,
      uploadDeferred: true,
    },
  ],
  responses: {},
};

function renderFlow(input: {
  attempts?: Parameters<typeof AttemptFlow>[0]["attempts"];
  openPayload?: AttemptPayload | null;
  feedback?: Parameters<typeof AttemptFlow>[0]["feedback"];
}) {
  return render(
    <AttemptFlow
      orgSlug="alpha-learning"
      assignmentId={id(10)}
      enrollmentId={id(11)}
      attempts={input.attempts ?? []}
      openPayload={input.openPayload ?? null}
      feedback={input.feedback ?? null}
      backHref="/back"
    />,
  );
}

describe("attempt flow", () => {
  test("an open attempt renders the payload with zero answer leakage", () => {
    const { container } = renderFlow({ openPayload: payload });
    expect(
      screen.getByText("Which layer grades responses?"),
    ).toBeInTheDocument();
    expect(screen.getByText("The server")).toBeInTheDocument();
    // no correct-answer data can appear anywhere — it never left the server
    expect(container.innerHTML).not.toMatch(/correct|rubric/i);
    expect(
      screen.getByRole("button", { name: /submit attempt/i }),
    ).toBeEnabled();
  });

  test("the countdown is labeled display-only; the server stays the authority", () => {
    renderFlow({ openPayload: payload });
    expect(
      screen.getByRole("timer", { name: /display only/i }),
    ).toBeInTheDocument();
  });

  test("file submission shows the guarded deferral — no fake upload control", () => {
    const { container } = renderFlow({ openPayload: payload });
    expect(
      screen.getByText(/file uploads are not yet enabled/i),
    ).toBeInTheDocument();
    expect(container.querySelector('input[type="file"]')).toBeNull();
  });

  test("pending review blocks new attempts and explains the wait", () => {
    renderFlow({
      attempts: [
        {
          id: id(20),
          status: "pending_review",
          attemptNumber: 1,
          scorePercent: null,
          passingPercent: 70,
        },
      ],
    });
    expect(screen.getByText(/awaiting review/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /start/i }),
    ).not.toBeInTheDocument();
  });

  test("a failed attempt shows the score against the threshold and offers a retake", () => {
    renderFlow({
      attempts: [
        {
          id: id(21),
          status: "failed",
          attemptNumber: 1,
          scorePercent: 40,
          passingPercent: 70,
        },
      ],
    });
    expect(screen.getByText(/scored 40%/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /start new attempt/i }),
    ).toBeEnabled();
  });

  test("a pass is terminal: result shown, no retake offered, feedback visible", () => {
    renderFlow({
      attempts: [
        {
          id: id(22),
          status: "passed",
          attemptNumber: 2,
          scorePercent: 90,
          passingPercent: 70,
        },
      ],
      feedback: {
        itemFeedback: [{ prompt: "Essay", text: "Clear argument." }],
        overall: "Strong work.",
      },
    });
    expect(
      screen.getByText(/you passed this assessment with 90%/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /start/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Clear argument.")).toBeInTheDocument();
    expect(screen.getByText("Strong work.")).toBeInTheDocument();
  });
});
