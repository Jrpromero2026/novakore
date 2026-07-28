import { render, screen } from "@testing-library/react";
import userEventImport from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { tenantThemeSchema } from "@novakore/domain";

vi.mock("@/lib/actions/branding", () => ({
  saveBrandDraftAction: vi.fn(async () => ({
    ok: true,
    message: "Draft saved.",
  })),
  publishBrandAction: vi.fn(async () => ({ ok: true })),
  revertBrandDraftAction: vi.fn(async () => ({ ok: true })),
  uploadBrandAssetAction: vi.fn(async () => ({ ok: true })),
  archiveBrandAssetAction: vi.fn(async () => ({ ok: true })),
}));

import { BrandStudio } from "./brand-studio";

const userEvent =
  (userEventImport as { default?: typeof userEventImport }).default ??
  userEventImport;

const goodTheme = tenantThemeSchema.parse({
  schemaVersion: 1,
  colors: { accentLight: "#5a5cff", accentDark: "#818cf8" },
});

// Pale accent + pale text on pale background: blocking in light mode.
const blockingTheme = tenantThemeSchema.parse({
  schemaVersion: 1,
  colors: {
    accentLight: "#eeeeef",
    accentDark: "#818cf8",
    backgroundLight: "#f2f2f2",
    textPrimaryLight: "#dddddd",
  },
});

function renderStudio(theme = goodTheme, canPublish = true) {
  return render(
    <BrandStudio
      orgSlug="alpha-learning"
      initialDraft={theme}
      publishedAt={null}
      draftUpdatedAt={null}
      canPublish={canPublish}
      assets={[]}
    />,
  );
}

describe("brand studio", () => {
  test("publish is available when contrast passes and permission is held", () => {
    renderStudio();
    expect(screen.getByRole("button", { name: /^publish$/i })).toBeEnabled();
    expect(screen.getByText(/contrast: ok/i)).toBeInTheDocument();
  });

  test("blocking contrast disables publication and explains why", () => {
    renderStudio(blockingTheme);
    expect(screen.getByRole("button", { name: /^publish$/i })).toBeDisabled();
    expect(screen.getByText(/contrast: blocking issues/i)).toBeInTheDocument();
    expect(screen.getAllByText(/blocks publishing/i).length).toBeGreaterThan(0);
  });

  test("without the publish permission there is no publish control", () => {
    renderStudio(goodTheme, false);
    expect(
      screen.queryByRole("button", { name: /^publish$/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/ask an administrator with publish access/i),
    ).toBeInTheDocument();
    // draft editing remains available
    expect(
      screen.getByRole("button", { name: /save draft/i }),
    ).toBeInTheDocument();
  });

  test("editing a color marks the draft dirty and saving clears it", async () => {
    renderStudio();
    const input = screen.getByLabelText(/accent — light mode$/i, {
      selector: "input[id]",
    });
    await userEvent.clear(input);
    await userEvent.type(input, "#be185d");
    expect(screen.getByText(/unsaved edits/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /save draft/i }));
    expect(await screen.findByText(/draft saved/i)).toBeInTheDocument();
  });

  test("color fields are labeled and keyboard-editable (a11y)", () => {
    renderStudio();
    expect(
      screen.getByLabelText(/accent — dark mode$/i, { selector: "input[id]" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/interface font/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/corner radius profile/i)).toBeInTheDocument();
  });
});
