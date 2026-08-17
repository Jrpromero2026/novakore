import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import type { ReactNode } from "react";
import type { ChecklistView } from "@/lib/onboarding/steps";

let mockPathname = "/acme/admin";
vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ push: vi.fn() }),
}));

const dismissChecklistAction = vi.fn(async () => ({ ok: true }));
const restoreChecklistAction = vi.fn(async () => ({ ok: true }));
const celebrateChecklistAction = vi.fn(async () => ({ ok: true }));
const recordOnboardingEventAction = vi.fn(async () => ({ ok: true }));
vi.mock("@/lib/actions/onboarding", () => ({
  dismissChecklistAction: (...args: unknown[]) =>
    dismissChecklistAction(...(args as [])),
  restoreChecklistAction: (...args: unknown[]) =>
    restoreChecklistAction(...(args as [])),
  celebrateChecklistAction: (...args: unknown[]) =>
    celebrateChecklistAction(...(args as [])),
  recordOnboardingEventAction: (...args: unknown[]) =>
    recordOnboardingEventAction(...(args as [])),
}));

import { OnboardingChecklist } from "./checklist";
import { WalkthroughProvider } from "./walkthrough";

function view(overrides: Partial<ChecklistView> = {}): ChecklistView {
  const steps: ChecklistView["steps"] = [
    {
      id: "journey",
      walkthroughId: "create-journey",
      href: "/acme/admin/learning",
      title: "Create your first Journey",
      explanation: "A Journey is the complete learning experience.",
      whyItMatters: "Everything learners do lives inside one.",
      estimatedMinutes: 5,
      complete: true,
    },
    {
      id: "program",
      walkthroughId: "create-program",
      href: "/acme/admin/courses",
      title: "Create your first Program",
      explanation: "A Program is a major section within a Journey.",
      whyItMatters: "Programs are versioned.",
      estimatedMinutes: 5,
      complete: false,
    },
    {
      id: "invite",
      walkthroughId: "invite-learner",
      href: "/acme/admin/members",
      title: "Invite your first Learner",
      explanation: "Send an email invitation.",
      whyItMatters: "An academy becomes real with its first learner.",
      complete: false,
    },
  ];
  const completed = steps.filter((s) => s.complete).length;
  return {
    steps,
    completedCount: completed,
    totalCount: steps.length,
    percentComplete: Math.round((completed / steps.length) * 100),
    nextStepId: steps.find((s) => !s.complete)?.id ?? null,
    allComplete: false,
    ...overrides,
  };
}

function renderChecklist(
  props: Partial<Parameters<typeof OnboardingChecklist>[0]> = {},
) {
  const node: ReactNode = (
    <WalkthroughProvider
      orgId="org-1"
      orgSlug="acme"
      permissions={[
        "org.manage",
        "paths.manage",
        "content.author",
        "content.view_draft",
        "org.members.manage",
      ]}
      terminologyOverrides={{}}
      recordEvent={vi.fn(async () => ({ ok: true }))}
    >
      <OnboardingChecklist
        orgSlug="acme"
        view={view()}
        dismissed={false}
        celebrated={false}
        canManage
        {...props}
      />
    </WalkthroughProvider>
  );
  return render(node);
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
  vi.clearAllMocks();
});

describe("Academy Launch checklist", () => {
  test("shows real progress, completed and incomplete states", () => {
    renderChecklist();
    expect(
      screen.getByRole("region", { name: /academy launch checklist/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/1 of 3 steps complete/i)).toBeInTheDocument();
    expect(screen.getByText("33%")).toBeInTheDocument();
    // Completed steps read as done, incomplete ones keep their actions.
    expect(screen.getByText("Done")).toBeInTheDocument();
    expect(
      screen.getAllByRole("link", { name: /take me there/i }),
    ).toHaveLength(2);
  });

  test("recommends the first incomplete step", () => {
    renderChecklist();
    expect(screen.getByText(/next: Create your first Program/i)).toBeVisible();
    expect(screen.getByText("Next")).toBeInTheDocument();
  });

  test("'Show me' launches the linked walkthrough", async () => {
    renderChecklist();
    const showMe = screen.getAllByRole("button", { name: "Show me" })[0]!;
    fireEvent.click(showMe);
    // create-program's first step targets the Courses sidebar item; with no
    // target rendered the coachmark still opens in its locating state.
    const dialog = await screen.findByRole("dialog", {
      name: /create a course/i,
    });
    expect(dialog).toHaveTextContent("Step 1 of 2");
  });

  test("'Why this matters' expands on demand", () => {
    renderChecklist();
    const why = screen.getAllByRole("button", {
      name: /why this matters/i,
    })[0]!;
    expect(screen.queryByText(/versioned/i)).not.toBeInTheDocument();
    fireEvent.click(why);
    expect(screen.getByText(/versioned/i)).toBeVisible();
  });

  test("expand/collapse hides the step list without losing progress", () => {
    renderChecklist();
    fireEvent.click(screen.getByRole("button", { name: "Collapse" }));
    expect(
      screen.queryByText("Create your first Program"),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/1 of 3 steps complete/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Expand" }));
    expect(screen.getByText("Create your first Program")).toBeVisible();
  });

  test("dismiss is admin-only", () => {
    renderChecklist({ canManage: false });
    expect(
      screen.queryByRole("button", { name: "Hide" }),
    ).not.toBeInTheDocument();
  });

  test("dismissing calls the org-scoped lifecycle action", async () => {
    renderChecklist();
    fireEvent.click(screen.getByRole("button", { name: "Hide" }));
    await waitFor(() => {
      expect(dismissChecklistAction).toHaveBeenCalledWith("acme");
    });
  });

  test("a dismissed, incomplete checklist offers restore to admins", async () => {
    renderChecklist({ dismissed: true });
    expect(screen.getByText(/checklist is hidden/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Restore" }));
    await waitFor(() => {
      expect(restoreChecklistAction).toHaveBeenCalledWith("acme");
    });
  });

  test("a dismissed checklist renders nothing for non-admins", () => {
    const { container } = renderChecklist({
      dismissed: true,
      canManage: false,
    });
    expect(container.querySelector("section, div.rounded-lg")).toBeNull();
  });

  test("full completion celebrates once, then settles into Academy ready", async () => {
    renderChecklist({
      view: view({
        steps: view().steps.map((s) => ({ ...s, complete: true })),
        completedCount: 3,
        percentComplete: 100,
        nextStepId: null,
        allComplete: true,
      }),
    });
    expect(screen.getByText(/your academy is ready/i)).toBeInTheDocument();
    expect(screen.getByText(/congratulations/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(celebrateChecklistAction).toHaveBeenCalledWith("acme");
    });
  });

  test("after the celebration is recorded, the compact ready state shows", () => {
    renderChecklist({
      view: view({
        steps: view().steps.map((s) => ({ ...s, complete: true })),
        completedCount: 3,
        percentComplete: 100,
        nextStepId: null,
        allComplete: true,
      }),
      celebrated: true,
    });
    expect(screen.getByText(/academy ready\./i)).toBeInTheDocument();
    expect(celebrateChecklistAction).not.toHaveBeenCalled();
  });

  test("an empty (fully permission-filtered) checklist renders nothing", () => {
    const { container } = renderChecklist({
      view: view({
        steps: [],
        completedCount: 0,
        totalCount: 0,
        percentComplete: 0,
        nextStepId: null,
        allComplete: false,
      }),
    });
    expect(container.textContent).toBe("");
  });
});
