import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => "/acme/admin/courses",
  useRouter: () => ({ push }),
}));

import { CommandPalette } from "@/components/command-palette";
import { buildNavSections } from "./nav-config";
import { AdminSidebar, ShellProvider } from "./nav";

const sections = buildNavSections("acme", [
  "content.view_draft",
  "analytics.view",
  "org.members.manage",
]);

describe("AdminSidebar", () => {
  test("renders grouped, permission-filtered navigation with an active item", () => {
    render(
      <ShellProvider>
        <AdminSidebar sections={sections} orgName="Acme" orgSlug="acme" />
      </ShellProvider>,
    );
    const nav = screen.getByRole("navigation", {
      name: "Workspace navigation",
    });
    expect(within(nav).getByRole("link", { name: "Studio" })).toHaveAttribute(
      "href",
      "/acme/admin/studio",
    );
    expect(
      within(nav).queryByRole("link", { name: "Roles & permissions" }),
    ).not.toBeInTheDocument();
    // Current route (courses) carries aria-current, not its siblings.
    expect(within(nav).getByRole("link", { name: "Courses" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(
      within(nav).getByRole("link", { name: "Overview" }),
    ).not.toHaveAttribute("aria-current");
  });

  test("collapse toggle is keyboard-reachable and labeled", () => {
    render(
      <ShellProvider>
        <AdminSidebar sections={sections} orgName="Acme" orgSlug="acme" />
      </ShellProvider>,
    );
    const toggle = screen.getByRole("button", { name: "Collapse navigation" });
    fireEvent.click(toggle);
    expect(
      screen.getByRole("button", { name: "Expand navigation" }),
    ).toBeInTheDocument();
    window.localStorage.removeItem("nk-nav-collapsed");
  });
});

describe("CommandPalette", () => {
  const entries = [
    {
      id: "nav-studio",
      label: "Studio",
      group: "Navigate",
      href: "/acme/admin/studio",
      keywords: ["author"],
    },
    {
      id: "create-course",
      label: "New course",
      group: "Create",
      href: "/acme/admin/courses",
    },
  ];

  beforeEach(() => push.mockClear());

  test("opens on Ctrl+K, filters, and navigates on Enter", async () => {
    const user = userEvent.setup();
    render(<CommandPalette entries={entries} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    const dialog = screen.getByRole("dialog", { name: "Command palette" });
    const input = within(dialog).getByRole("combobox");

    await user.type(input, "cour");
    const options = within(dialog).getAllByRole("option");
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveTextContent("New course");

    await user.keyboard("{Enter}");
    expect(push).toHaveBeenCalledWith("/acme/admin/courses");
    expect(
      screen.queryByRole("dialog", { name: "Command palette" }),
    ).not.toBeInTheDocument();
  });

  test("closes on Escape", () => {
    render(<CommandPalette entries={entries} />);
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
