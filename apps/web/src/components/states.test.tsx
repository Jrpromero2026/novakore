import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { AccessDenied, NoOrganization } from "./states";

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

  test("no-organization state names the account and explains invitation-only access", () => {
    render(
      <NoOrganization
        email="person@example.com"
        signOut={<button>Sign out</button>}
      />,
    );
    expect(
      screen.getByRole("heading", { name: /no organization yet/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("person@example.com")).toBeInTheDocument();
    expect(screen.getByText(/by invitation/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /sign out/i }),
    ).toBeInTheDocument();
  });

  test("no-organization state handles a missing email", () => {
    render(<NoOrganization email={null} signOut={<span />} />);
    expect(
      screen.getByText(/isn't a member of any organization/i),
    ).toBeInTheDocument();
  });
});
