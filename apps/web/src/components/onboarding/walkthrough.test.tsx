import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import type { ReactNode } from "react";

/**
 * Walkthrough engine tests: start → highlight → real-action advancement,
 * exit safety (Escape), missing-target recovery, and resume behavior.
 * Navigation is mocked; DOM targets are real elements with data-tour-id.
 */

let mockPathname = "/acme/admin";
const pushMock = vi.fn((href: string) => {
  mockPathname = href;
});
vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ push: pushMock }),
}));

import { StartWalkthroughButton, WalkthroughProvider } from "./walkthrough";

const recordEvent = vi.fn(async () => ({ ok: true }));

function Providers({
  children,
  permissions = [
    "org.manage",
    "org.branding.manage",
    "org.members.manage",
    "paths.manage",
    "content.author",
    "content.view_draft",
    "content.publish",
    "enrollment.manage",
    "analytics.view",
  ],
}: {
  children?: ReactNode;
  permissions?: string[];
}) {
  return (
    <WalkthroughProvider
      orgId="org-1"
      orgSlug="acme"
      permissions={permissions}
      terminologyOverrides={{}}
      recordEvent={recordEvent}
    >
      {children}
    </WalkthroughProvider>
  );
}

beforeAll(() => {
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
  Element.prototype.scrollIntoView = vi.fn();
});

beforeEach(() => {
  mockPathname = "/acme/admin";
  window.localStorage.clear();
  window.sessionStorage.clear();
  recordEvent.mockClear();
  pushMock.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

const eventTypes = () =>
  recordEvent.mock.calls.map(
    (call) => (call as unknown[])[1] as { type: string },
  );

describe("walkthrough engine", () => {
  test("starting a tour highlights the real target and explains it", async () => {
    mockPathname = "/acme/admin/enrollments";
    render(
      <Providers>
        <div data-tour-id="enrollments-overview">
          <p>enrollment rows</p>
        </div>
        <StartWalkthroughButton walkthroughId="review-progress">
          Show me
        </StartWalkthroughButton>
      </Providers>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Show me" }));

    // The navigation step auto-completes because we are already on the
    // destination route; the engine advances to the final, target-anchored
    // step.
    await screen.findByText("Step 2 of 2", {}, { timeout: 4000 });
    const dialog = screen.getByRole("dialog", {
      name: /review learner progress/i,
    });
    expect(dialog).toHaveTextContent("Watch progress here");

    expect(
      eventTypes().some((e) => e.type === "onboarding.walkthrough.started"),
    ).toBe(true);

    // Advance "next" step ends the tour and records completion.
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(
      eventTypes().some((e) => e.type === "onboarding.walkthrough.completed"),
    ).toBe(true);
  });

  test("Escape always exits the tour safely", async () => {
    mockPathname = "/acme/admin/enrollments";
    render(
      <Providers>
        <div data-tour-id="enrollments-overview" />
        <StartWalkthroughButton walkthroughId="review-progress">
          Show me
        </StartWalkthroughButton>
      </Providers>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Show me" }));
    await screen.findByRole("dialog", {}, { timeout: 4000 });

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(
      eventTypes().some((e) => e.type === "onboarding.walkthrough.exited"),
    ).toBe(true);
    // Exit clears stored progress — nothing resumes on the next mount.
    expect(window.localStorage.getItem("nk-tour:org-1")).toBeNull();
  });

  test("a missing target is recovered, never a trap", async () => {
    vi.useFakeTimers();
    mockPathname = "/acme/admin/enrollments";
    render(
      <Providers>
        {/* No enrollments-overview element anywhere. */}
        <StartWalkthroughButton walkthroughId="review-progress">
          Show me
        </StartWalkthroughButton>
      </Providers>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Show me" }));

    // Step 1 auto-completes from the route; give the final step its own
    // full timeout window.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(screen.getByText("Step 2 of 2")).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent(/couldn't find that control/i);
    expect(
      eventTypes().some(
        (e) => e.type === "onboarding.walkthrough.target_missing",
      ),
    ).toBe(true);

    // Skipping past the missing step completes the tour (it was the last).
    fireEvent.click(screen.getByRole("button", { name: /skip this step/i }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      eventTypes().some((e) => e.type === "onboarding.walkthrough.recovered"),
    ).toBe(true);
  });

  test("tours are permission-gated — no button, no start", () => {
    render(
      <Providers permissions={["content.author"]}>
        <StartWalkthroughButton walkthroughId="invite-learner">
          Show me invites
        </StartWalkthroughButton>
      </Providers>,
    );
    expect(
      screen.queryByRole("button", { name: "Show me invites" }),
    ).not.toBeInTheDocument();
  });

  test("in-progress tours resume from stored per-org progress", async () => {
    mockPathname = "/acme/admin/enrollments";
    window.localStorage.setItem(
      "nk-tour:org-1",
      JSON.stringify({ id: "review-progress", version: 1, stepIndex: 1 }),
    );
    render(
      <Providers>
        <div data-tour-id="enrollments-overview" />
      </Providers>,
    );
    await screen.findByRole(
      "dialog",
      { name: /review learner progress/i },
      { timeout: 4000 },
    );
    expect(
      eventTypes().some((e) => e.type === "onboarding.walkthrough.resumed"),
    ).toBe(true);
  });

  test("a version bump invalidates stored progress instead of resuming", async () => {
    window.localStorage.setItem(
      "nk-tour:org-1",
      JSON.stringify({ id: "review-progress", version: 99, stepIndex: 1 }),
    );
    render(<Providers />);
    await waitFor(() => {
      expect(window.localStorage.getItem("nk-tour:org-1")).toBeNull();
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
