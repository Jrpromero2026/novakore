import { render, screen, within } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

let pathname = "/acme/admin/branding";
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push: vi.fn() }),
}));

import { buildBreadcrumbs } from "@/lib/navigation/breadcrumbs";
import { buildDomains } from "@/lib/navigation/domains";
import { Breadcrumbs } from "./breadcrumbs";
import { ContextRail } from "./context-rail";
import { GlobalNav } from "./global-nav";
import { NavigationCard, SectionCard } from "./navigation-card";
import { PageShell } from "./page-shell";

const ALL = [
  "content.view_draft",
  "paths.manage",
  "assessment.grade",
  "analytics.view",
  "org.members.manage",
  "org.branding.manage",
  "org.manage",
];
const domains = buildDomains("acme", ALL);

describe("GlobalNav", () => {
  test("exposes six words, not twenty destinations", () => {
    render(<GlobalNav domains={domains} organizationName="Acme Athletic" />);
    // Two navs render (desktop + narrow); both carry the same domain list.
    const navs = screen.getAllByRole("navigation", {
      name: /workspace domains/i,
    });
    const labels = within(navs[0]!)
      .getAllByRole("link")
      .map((a) => a.textContent);
    expect(labels).toEqual([
      "Home",
      "Knowledge",
      "Learning",
      "People",
      "Intelligence",
      "Workspace",
    ]);
  });

  test("derives the active domain from a DEEP route, not a prop", () => {
    // The bookmark / SSO deep-link case: landing directly on a nested page
    // must still highlight the owning domain.
    pathname = "/acme/admin/branding";
    render(<GlobalNav domains={domains} organizationName="Acme" />);
    const current = screen.getAllByRole("link", { current: "page" });
    expect(current.every((el) => el.textContent === "Workspace")).toBe(true);
  });

  test("a nested child route still resolves to its domain", () => {
    pathname = "/acme/admin/courses/abc-123/lessons/def";
    render(<GlobalNav domains={domains} organizationName="Acme" />);
    expect(
      screen.getAllByRole("link", { current: "page" })[0]?.textContent,
    ).toBe("Learning");
  });

  test("shows the organization so the workspace is never in doubt", () => {
    pathname = "/acme/admin";
    render(<GlobalNav domains={domains} organizationName="Acme Athletic" />);
    expect(screen.getAllByText("Acme Athletic").length).toBeGreaterThan(0);
  });

  test("renders shell controls passed as children", () => {
    render(
      <GlobalNav domains={domains} organizationName="Acme">
        <button type="button">Search</button>
      </GlobalNav>,
    );
    expect(screen.getByRole("button", { name: "Search" })).toBeTruthy();
  });
});

describe("Breadcrumbs", () => {
  test("renders the trail as an ordered list inside a labelled nav", () => {
    const crumbs = buildBreadcrumbs(domains, "/acme/admin/branding");
    render(<Breadcrumbs crumbs={crumbs} />);
    const nav = screen.getByRole("navigation", { name: /breadcrumb/i });
    expect(within(nav).getAllByRole("listitem")).toHaveLength(3);
  });

  test("the current page is marked and is not a link", () => {
    render(
      <Breadcrumbs
        crumbs={buildBreadcrumbs(domains, "/acme/admin/branding")}
      />,
    );
    const current = screen.getByText("Branding");
    expect(current.getAttribute("aria-current")).toBe("page");
    expect(current.tagName).not.toBe("A");
  });

  test("a section is text, never a dead link", () => {
    render(
      <Breadcrumbs
        crumbs={buildBreadcrumbs(domains, "/acme/admin/branding")}
      />,
    );
    expect(screen.getByText("Identity").tagName).not.toBe("A");
    expect(screen.getByRole("link", { name: "Workspace" })).toBeTruthy();
  });

  test("renders nothing at all when there is no trail", () => {
    const { container } = render(<Breadcrumbs crumbs={[]} />);
    expect(container.firstChild).toBeNull();
  });
});

describe("NavigationCard", () => {
  test("the whole card is the link, not just the title", () => {
    render(
      <NavigationCard
        href="/acme/admin/branding"
        label="Branding"
        description="Logo, colors and typography"
        icon="branding"
      />,
    );
    const link = screen.getByRole("link", { name: /branding/i });
    expect(link.getAttribute("href")).toBe("/acme/admin/branding");
    // The description lives inside the same link, so the click target matches
    // the visual affordance.
    expect(within(link).getByText(/logo, colors/i)).toBeTruthy();
  });

  test("marks itself as the current page when active", () => {
    render(
      <NavigationCard
        href="/acme/admin/branding"
        label="Branding"
        description="Logo, colors and typography"
        icon="branding"
        active
      />,
    );
    expect(
      screen.getByRole("link", { current: "page" }).getAttribute("href"),
    ).toBe("/acme/admin/branding");
  });

  test("an unknown icon key falls back rather than crashing the page", () => {
    render(
      <NavigationCard
        href="/x"
        label="Thing"
        description="A thing"
        icon="not-a-real-icon"
      />,
    );
    expect(screen.getByRole("link", { name: /thing/i })).toBeTruthy();
  });
});

describe("SectionCard", () => {
  const workspace = domains.find((d) => d.key === "workspace")!;

  test("renders the group heading, its purpose, and every destination", () => {
    const identity = workspace.sections[0]!;
    render(<SectionCard section={identity} />);
    expect(screen.getByRole("heading", { name: identity.label })).toBeTruthy();
    expect(screen.getByText(identity.description)).toBeTruthy();
    expect(screen.getAllByRole("link")).toHaveLength(identity.items.length);
  });

  test("highlights only the destination matching activeHref", () => {
    const identity = workspace.sections[0]!;
    render(
      <SectionCard section={identity} activeHref="/acme/admin/branding" />,
    );
    const current = screen.getAllByRole("link", { current: "page" });
    expect(current).toHaveLength(1);
    expect(current[0]?.getAttribute("href")).toBe("/acme/admin/branding");
  });
});

describe("ContextRail", () => {
  test("states which organization is being edited", () => {
    render(
      <ContextRail
        organizationName="Acme Athletic"
        organizationSlug="acme"
        status="active"
        ownerEmail="owner@acme.test"
      />,
    );
    const rail = screen.getByRole("complementary", {
      name: /organization context/i,
    });
    expect(within(rail).getByText("Acme Athletic")).toBeTruthy();
    expect(within(rail).getByText("/acme")).toBeTruthy();
    expect(within(rail).getByText("owner@acme.test")).toBeTruthy();
  });

  test("omits the owner block entirely when there is no owner to show", () => {
    render(
      <ContextRail
        organizationName="Acme"
        organizationSlug="acme"
        status="active"
      />,
    );
    expect(screen.queryByText(/workspace owner/i)).toBeNull();
  });

  test("quick links are real links", () => {
    render(
      <ContextRail
        organizationName="Acme"
        organizationSlug="acme"
        status="active"
        quickLinks={[{ href: "/acme/admin/members", label: "Manage members" }]}
      />,
    );
    expect(
      screen
        .getByRole("link", { name: /manage members/i })
        .getAttribute("href"),
    ).toBe("/acme/admin/members");
  });
});

describe("PageShell", () => {
  test("puts trail, heading and content in one predictable order", () => {
    render(
      <PageShell
        crumbs={buildBreadcrumbs(domains, "/acme/admin/workspace")}
        title="Workspace"
        description="How this organization is governed."
      >
        <p>Body</p>
      </PageShell>,
    );
    expect(
      screen.getByRole("heading", { level: 1, name: "Workspace" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("navigation", { name: /breadcrumb/i }),
    ).toBeTruthy();
    expect(screen.getByText("Body")).toBeTruthy();
  });

  test("the rail renders when supplied and is absent when not", () => {
    const { rerender } = render(
      <PageShell crumbs={[]} title="Workspace" rail={<div>Rail</div>}>
        <p>Body</p>
      </PageShell>,
    );
    expect(screen.getByText("Rail")).toBeTruthy();

    rerender(
      <PageShell crumbs={[]} title="Workspace">
        <p>Body</p>
      </PageShell>,
    );
    expect(screen.queryByText("Rail")).toBeNull();
  });

  test("only one h1 per page — the level you are operating at", () => {
    render(
      <PageShell crumbs={[]} title="Workspace">
        <SectionCard
          section={domains.find((d) => d.key === "workspace")!.sections[0]!}
        />
      </PageShell>,
    );
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });
});
