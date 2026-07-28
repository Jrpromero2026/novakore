import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

function Probe() {
  return (
    <main>
      <h1>NovaKore</h1>
    </main>
  );
}

test("test runner renders React components in jsdom", () => {
  render(<Probe />);
  expect(screen.getByRole("heading", { name: "NovaKore" })).toBeInTheDocument();
});
