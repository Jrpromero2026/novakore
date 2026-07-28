import { render, screen } from "@testing-library/react";
import userEventImport from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

vi.mock("@/lib/actions/assessments", () => ({
  claimReviewAction: vi.fn(async () => ({ ok: true })),
  completeReviewAction: vi.fn(async () => ({ ok: true })),
}));

import { completeReviewAction } from "@/lib/actions/assessments";
import { ReviewForm } from "./review-form";

const userEvent =
  (userEventImport as { default?: typeof userEventImport }).default ??
  userEventImport;

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const detail = {
  attemptId: id(1),
  reviewStatus: "pending_review",
  subjectiveItems: [
    {
      id: id(2),
      prompt: "Explain the outbox pattern.",
      points: 10,
      required: true,
      rubric: "Full marks for atomicity + idempotency.",
      responseText: "The event commits with the state change.",
    },
  ],
};

describe("review form", () => {
  test("shows the rubric and the learner's response", () => {
    render(<ReviewForm orgSlug="alpha-learning" detail={detail} />);
    expect(screen.getByText(/rubric: full marks/i)).toBeInTheDocument();
    expect(
      screen.getByText(/the event commits with the state change/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /claim review/i })).toBeEnabled();
  });

  test("completion is blocked until every answered item has an in-bounds score", async () => {
    render(<ReviewForm orgSlug="alpha-learning" detail={detail} />);
    const complete = screen.getByRole("button", { name: /complete review/i });
    expect(complete).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent(/needs a score/i);

    const score = screen.getByLabelText(/score \(0–10\)/i);
    await userEvent.type(score, "15");
    expect(screen.getByRole("alert")).toHaveTextContent(/must be 0–10/i);
    expect(complete).toBeDisabled();

    await userEvent.clear(score);
    await userEvent.type(score, "8");
    expect(complete).toBeEnabled();
    await userEvent.click(complete);
    expect(vi.mocked(completeReviewAction)).toHaveBeenCalledWith(
      "alpha-learning",
      id(1),
      { [id(2)]: 8 },
      expect.any(Object),
      "",
    );
  });
});
