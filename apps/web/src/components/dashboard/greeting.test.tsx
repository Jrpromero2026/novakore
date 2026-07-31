import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { Greeting } from "./greeting";
import { handleFromEmail } from "@/lib/format";

afterEach(() => vi.useRealTimers());

describe("Greeting", () => {
  test("greets the viewer by handle, never the organization", () => {
    vi.setSystemTime(new Date("2026-07-30T09:00:00"));
    render(<Greeting name={handleFromEmail("alpha.owner@novakore.test")} />);
    expect(screen.getByText("Good morning, Alpha")).toBeInTheDocument();
  });

  test("falls back to a neutral salutation when no name is available", () => {
    vi.setSystemTime(new Date("2026-07-30T20:00:00"));
    render(<Greeting name={null} />);
    expect(screen.getByText("Good evening")).toBeInTheDocument();
  });

  test("handleFromEmail returns null for missing accounts", () => {
    expect(handleFromEmail(null)).toBeNull();
    expect(handleFromEmail(undefined)).toBeNull();
    expect(handleFromEmail("")).toBeNull();
  });
});
