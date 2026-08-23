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

  test("a plus-tagged address is greeted by the name, not the tag", () => {
    // Subaddressing is ordinary — people sign up with sam+trial@ — and the
    // separator split used to run first, producing "Sam+trial" as a name.
    expect(handleFromEmail("sam+trial@acme.com")).toBe("Sam");
    expect(handleFromEmail("jrpromero16+empty-abc@gmail.com")).toBe(
      "Jrpromero16",
    );
  });

  test("an address with no name in it yields no name", () => {
    // Better a bare "Good morning" than "Good morning, 12345".
    expect(handleFromEmail("12345@example.com")).toBeNull();
    expect(handleFromEmail("+tag@example.com")).toBeNull();
  });

  test("ordinary addresses still resolve", () => {
    expect(handleFromEmail("team@builtforher.io")).toBe("Team");
    expect(handleFromEmail("alpha.owner@novakore.test")).toBe("Alpha");
    expect(handleFromEmail("jane_doe@example.com")).toBe("Jane");
  });
});
