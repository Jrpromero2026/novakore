import { render, screen } from "@testing-library/react";
import userEventImport from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

// Server actions cannot execute in jsdom — the form wiring is what we test.
vi.mock("@/lib/actions/auth", () => ({
  signInAction: vi.fn(async () => ({ ok: false })),
  magicLinkAction: vi.fn(async () => ({ ok: true, message: "sent" })),
}));

import { SignInForm } from "./sign-in-form";

// user-event ships CJS default interop
const userEvent =
  (userEventImport as { default?: typeof userEventImport }).default ??
  userEventImport;

describe("sign-in form", () => {
  test("password mode renders accessible, labeled fields", () => {
    render(<SignInForm />);
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(
      screen.getByLabelText(/password/i, { selector: "input" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^sign in$/i }),
    ).toBeInTheDocument();
  });

  test("magic-link mode is reachable and offers only an email field", async () => {
    render(<SignInForm />);
    await userEvent.click(screen.getByRole("tab", { name: /magic link/i }));
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /email me a sign-in link/i }),
    ).toBeInTheDocument();
  });

  test("no OAuth or SSO affordances exist (owner decision D-04)", () => {
    render(<SignInForm />);
    for (const provider of [
      /google/i,
      /apple/i,
      /microsoft/i,
      /sso/i,
      /passkey/i,
      /phone/i,
    ]) {
      expect(screen.queryByText(provider)).not.toBeInTheDocument();
    }
  });
});
