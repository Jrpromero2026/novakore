"use client";

import {
  resolveThemeTokens,
  type TenantTheme,
  type ThemeMode,
} from "@novakore/domain";

/**
 * Live theme preview. Uses the SAME resolveThemeTokens() the real
 * application uses — this is a scoped token re-application, not a mockup.
 * All values are resolver-produced hex; children use normal token utilities
 * which inherit the scoped custom properties.
 */
function PreviewSurface({
  theme,
  mode,
}: {
  theme: TenantTheme | null;
  mode: ThemeMode;
}) {
  const t = resolveThemeTokens(theme, mode);
  const vars = {
    "--background": t.background,
    "--background-elevated": t.backgroundElevated,
    "--background-subtle": t.backgroundSubtle,
    "--surface": t.surface,
    "--surface-elevated": t.surfaceElevated,
    "--surface-interactive": t.surfaceInteractive,
    "--text-primary": t.textPrimary,
    "--text-secondary": t.textSecondary,
    "--text-muted": t.textMuted,
    "--text-inverse": t.textInverse,
    "--border-default": t.borderDefault,
    "--border-strong": t.borderStrong,
    "--border-subtle": t.borderSubtle,
    "--accent": t.accent,
    "--accent-hover": t.accentHover,
    "--accent-active": t.accentActive,
    "--accent-contrast": t.accentContrast,
    "--focus-ring": t.focusRing,
    "--success": t.success,
    "--warning": t.warning,
    "--danger": t.danger,
    "--info": t.info,
  } as React.CSSProperties;

  return (
    <div
      style={vars}
      data-preview-mode={mode}
      className="min-w-0 flex-1 overflow-hidden rounded-lg border border-border-default"
    >
      <div className="bg-background p-4">
        <p
          className="mb-3 text-caption uppercase text-text-muted"
          style={{ letterSpacing: "var(--tracking-caps)" }}
        >
          {mode} mode
        </p>

        {/* admin shell strip + nav */}
        <div className="mb-3 overflow-hidden rounded-md border border-border-default bg-surface">
          <div className="flex items-center justify-between border-b border-border-default px-3 py-2">
            <span className="text-body-sm font-semibold text-text-primary">
              Organization
            </span>
            <span className="rounded-md bg-accent px-2 py-1 text-caption font-medium text-accent-contrast">
              Primary action
            </span>
          </div>
          <div className="flex gap-1 px-3 py-2">
            <span className="rounded-md bg-accent-soft px-2 py-1 text-caption font-medium text-accent">
              Overview
            </span>
            <span className="rounded-md px-2 py-1 text-caption text-text-secondary">
              Members
            </span>
            <span className="rounded-md px-2 py-1 text-caption text-text-secondary">
              Academies
            </span>
          </div>
          {/* table */}
          <table className="w-full border-t border-border-default text-left">
            <thead>
              <tr className="text-caption text-text-muted">
                <th className="px-3 py-1.5 font-medium">Member</th>
                <th className="px-3 py-1.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="text-body-sm text-text-primary">
              <tr className="border-t border-border-subtle">
                <td className="px-3 py-1.5">a.rivera</td>
                <td className="px-3 py-1.5">
                  <span className="text-success">Active</span>
                </td>
              </tr>
              <tr className="border-t border-border-subtle">
                <td className="px-3 py-1.5">j.chen</td>
                <td className="px-3 py-1.5">
                  <span className="text-warning">Invited</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* sign-in card + member card row */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-md border border-border-default bg-surface p-3">
            <p className="text-body-sm font-semibold text-text-primary">
              Sign in
            </p>
            <div className="mt-2 rounded-md border border-border-default bg-background-elevated px-2 py-1.5 text-caption text-text-muted">
              name@example.com
            </div>
            <div className="mt-2 rounded-md bg-accent px-2 py-1.5 text-center text-caption font-medium text-accent-contrast">
              Continue
            </div>
            <div className="mt-1.5 rounded-md border border-border-strong px-2 py-1.5 text-center text-caption font-medium text-text-primary">
              Secondary
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <div className="rounded-md border border-border-default bg-surface p-3">
              <p className="text-body-sm font-semibold text-text-primary">
                Foundations
              </p>
              <p className="text-caption text-text-secondary">
                4 programs · 12 members
              </p>
            </div>
            {/* status semantics — protected, identical in every tenant theme */}
            <div className="rounded-md border border-danger/40 bg-surface px-2.5 py-1.5 text-caption text-danger">
              Error: required field missing
            </div>
            <div className="rounded-md border border-warning/40 bg-surface px-2.5 py-1.5 text-caption text-warning">
              Warning: unpublished changes
            </div>
            <div className="rounded-md border border-border-default bg-surface px-2.5 py-1.5 text-center text-caption text-text-muted">
              Nothing here yet — create your first item
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ThemePreview({ theme }: { theme: TenantTheme | null }) {
  return (
    <div
      className="flex flex-col gap-4 lg:flex-row"
      aria-label="Theme preview, light and dark"
    >
      <PreviewSurface theme={theme} mode="light" />
      <PreviewSurface theme={theme} mode="dark" />
    </div>
  );
}
