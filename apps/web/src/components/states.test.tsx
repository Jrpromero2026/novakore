import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { AccessDenied } from "./states";

describe("critical UI states", () => {
  test("access-denied explains the situation and offers a way back", () => {
    render(<AccessDenied backHref="/alpha-learning/admin" />);
    expect(
      screen.getByRole("heading", { name: /don't have permission/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /back to overview/i }),
    ).toHaveAttribute("href", "/alpha-learning/admin");
  });
});
