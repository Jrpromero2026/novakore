import { render, screen, within } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { ActivitySparkline, CompositionBar } from "./viz";

describe("ActivitySparkline", () => {
  const days = (counts: number[]) =>
    counts.map((count, i) => ({
      day: `2026-07-${String(i + 1).padStart(2, "0")}`,
      count,
    }));

  test("zero-data window states plainly that nothing happened", () => {
    render(
      <ActivitySparkline data={days([0, 0, 0])} label="Workspace events" />,
    );
    expect(
      screen.getByText("No events in the last 3 days"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", {
        name: "Workspace events: no events in the last 3 days",
      }),
    ).toBeInTheDocument();
  });

  test("empty array renders a truthful message, not a chart", () => {
    render(<ActivitySparkline data={[]} label="Workspace events" />);
    expect(screen.getByText("No activity recorded yet.")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  test("populated window exposes totals and a per-day text equivalent", () => {
    render(
      <ActivitySparkline data={days([2, 9, 4])} label="Workspace events" />,
    );
    // Accessible description carries real totals and the true peak.
    expect(
      screen.getByRole("img", {
        name: "Workspace events: 15 events across 3 days, peaking at 9 on 2026-07-02",
      }),
    ).toBeInTheDocument();
    // Text equivalent table exists for assistive tech.
    const table = screen.getByRole("table", { name: "Workspace events" });
    expect(
      within(table).getByRole("rowheader", { name: "2026-07-02" }),
    ).toBeInTheDocument();
  });
});

describe("CompositionBar", () => {
  test("zero courses renders an explanation instead of an empty bar", () => {
    render(
      <CompositionBar
        composition={{ published: 0, draft: 0, other: 0, total: 0 }}
      />,
    );
    expect(screen.getByText(/No courses yet/)).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  test("segments are labeled in text, never color alone", () => {
    render(
      <CompositionBar
        composition={{ published: 3, draft: 2, other: 0, total: 5 }}
      />,
    );
    expect(
      screen.getByRole("img", { name: "5 courses: 3 published, 2 draft" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Published")).toBeInTheDocument();
    expect(screen.getByText("Draft")).toBeInTheDocument();
    // Zero-valued segments are omitted rather than drawn at zero width.
    expect(screen.queryByText("Other")).not.toBeInTheDocument();
  });
});
