"use client";

import { useMemo, useState, useTransition } from "react";
import {
  ASSET_POLICY,
  FONT_CATALOG,
  NOVAKORE_BASE,
  RADIUS_PROFILES,
  THEME_SCHEMA_VERSION,
  contrastRatio,
  evaluateThemeContrast,
  formatBytes,
  tenantThemeSchema,
  type ContrastIssue,
  type TenantTheme,
} from "@novakore/domain";
import {
  publishBrandAction,
  revertBrandDraftAction,
  saveBrandDraftAction,
} from "@/lib/actions/branding";
import { idle, type ActionState } from "@/lib/actions/types";
import {
  ActionBanner,
  Badge,
  Button,
  Card,
  CardHeader,
  Field,
  Input,
  Select,
} from "@/components/ui/primitives";
import { Alert } from "@/components/ui/feedback";
import { ThemePreview } from "./theme-preview";
import { AssetSlot, type AssetSlotView } from "./asset-slots";

interface StudioProps {
  orgSlug: string;
  initialDraft: TenantTheme;
  publishedAt: string | null;
  draftUpdatedAt: string | null;
  canPublish: boolean;
  assets: AssetSlotView[];
}

const FONT_LABELS: Record<string, string> = {
  geist: "Geist (platform default)",
  inter: "Inter",
  system: "System",
};

const RADIUS_LABELS: Record<string, string> = {
  square: "Square",
  balanced: "Balanced",
  soft: "Soft",
};

function ColorField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
}) {
  const valid = /^#[0-9a-fA-F]{6}$/.test(value);
  return (
    <Field
      label={label}
      htmlFor={id}
      error={valid ? undefined : "Use a 6-digit hex color."}
    >
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${label} picker`}
          value={valid ? value : "#5a5cff"}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-10 shrink-0 cursor-pointer rounded-md border border-border-default bg-surface p-1"
        />
        <Input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value.trim())}
          className="font-mono"
          spellCheck={false}
        />
      </div>
    </Field>
  );
}

function ContrastIndicator({ issues }: { issues: ContrastIssue[] }) {
  if (issues.length === 0) {
    return (
      <Alert tone="success" title="Contrast">
        All measured pairings meet the required ratios in both modes.
      </Alert>
    );
  }
  return (
    <div className="space-y-1.5">
      {issues.map((i) => (
        <Alert
          key={`${i.mode}-${i.pairing}`}
          tone={i.level === "blocking" ? "danger" : "warning"}
          title={i.level === "blocking" ? "Blocks publishing" : "Warning"}
        >
          {i.mode} mode — {i.pairing} measures {i.ratio}:1 (minimum {i.required}
          :1).
        </Alert>
      ))}
    </div>
  );
}

export function BrandStudio({
  orgSlug,
  initialDraft,
  publishedAt,
  draftUpdatedAt,
  canPublish,
  assets,
}: StudioProps) {
  const [draft, setDraft] = useState<TenantTheme>(initialDraft);
  const [dirty, setDirty] = useState(false);
  const [result, setResult] = useState<ActionState>(idle);
  const [pending, startTransition] = useTransition();

  const update = (mutate: (d: TenantTheme) => TenantTheme) => {
    setDraft((d) => mutate(structuredClone(d)));
    setDirty(true);
  };
  const setColor = (key: keyof TenantTheme["colors"], value: string) =>
    update((d) => {
      d.colors[key] = value as never;
      return d;
    });

  // Live validation + contrast, computed with the same domain functions the
  // server uses (the server re-validates authoritatively on save/publish).
  const { previewTheme, issues } = useMemo(() => {
    const result = tenantThemeSchema.safeParse(draft);
    return {
      previewTheme: result.success ? result.data : null,
      issues: result.success ? evaluateThemeContrast(result.data) : [],
    };
  }, [draft]);
  const parsedOk = previewTheme !== null;
  const hasBlocking = issues.some((i) => i.level === "blocking");

  const run = (fn: () => Promise<ActionState>) =>
    startTransition(async () => {
      const outcome = await fn();
      setResult(outcome);
      if (outcome.ok) setDirty(false);
    });

  const accentContrastNow = /^#[0-9a-fA-F]{6}$/.test(draft.colors.accentLight)
    ? Math.round(contrastRatio(draft.colors.accentLight, "#ffffff") * 100) / 100
    : null;

  return (
    <div className="space-y-6">
      {/* ---- Overview + publish bar ---- */}
      <Card>
        <CardHeader
          title="Brand status"
          description="Drafts never affect live surfaces. Publishing requires the publish permission and passing contrast checks."
        />
        <div className="flex flex-wrap items-center gap-3 px-5 py-4">
          <Badge tone={publishedAt ? "positive" : "neutral"}>
            {publishedAt
              ? `Published ${new Date(publishedAt).toLocaleString()}`
              : "Never published"}
          </Badge>
          <Badge tone={dirty ? "warning" : "neutral"}>
            {dirty
              ? "Unsaved edits"
              : draftUpdatedAt
                ? `Draft saved ${new Date(draftUpdatedAt).toLocaleString()}`
                : "No draft yet"}
          </Badge>
          <Badge tone={hasBlocking ? "danger" : "positive"}>
            {hasBlocking ? "Contrast: blocking issues" : "Contrast: OK"}
          </Badge>
          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="secondary"
              disabled={pending}
              onClick={() =>
                run(async () => {
                  const outcome = await revertBrandDraftAction(orgSlug);
                  if (outcome.ok) {
                    const reverted = tenantThemeSchema.safeParse(outcome.data);
                    setDraft(
                      reverted.success
                        ? reverted.data
                        : {
                            schemaVersion: THEME_SCHEMA_VERSION,
                            colors: {
                              accentLight: NOVAKORE_BASE.light.accent,
                              accentDark: NOVAKORE_BASE.dark.accent,
                            },
                            typography: { interfaceFont: "geist" },
                            shape: { radiusProfile: "balanced" },
                            modes: {
                              availability: "both",
                              defaultMode: "system",
                            },
                          },
                    );
                  }
                  return outcome;
                })
              }
            >
              Revert to published
            </Button>
            <Button
              variant="secondary"
              disabled={pending || !parsedOk}
              onClick={() => run(() => saveBrandDraftAction(orgSlug, draft))}
            >
              {pending ? "Working…" : "Save draft"}
            </Button>
            {canPublish ? (
              <Button
                disabled={pending || hasBlocking || !parsedOk}
                onClick={() =>
                  run(async () => {
                    const saved = await saveBrandDraftAction(orgSlug, draft);
                    if (!saved.ok) return saved;
                    return publishBrandAction(orgSlug);
                  })
                }
              >
                Publish
              </Button>
            ) : (
              <span className="text-caption text-text-muted">
                Ask an administrator with publish access to make this live
              </span>
            )}
          </div>
        </div>
        <div className="px-5 pb-4 empty:hidden">
          <ActionBanner state={result} />
        </div>
      </Card>

      {/* ---- Colors ---- */}
      <Card>
        <CardHeader
          title="Brand colors"
          description="Structured roles, validated on save. Status and security colors are platform-protected and cannot be changed."
        />
        <div className="grid gap-4 px-5 py-4 sm:grid-cols-2">
          <ColorField
            id="accent-light"
            label="Accent — light mode"
            value={draft.colors.accentLight}
            onChange={(v) => setColor("accentLight", v)}
          />
          <ColorField
            id="accent-dark"
            label="Accent — dark mode"
            value={draft.colors.accentDark}
            onChange={(v) => setColor("accentDark", v)}
          />
          <ColorField
            id="bg-light"
            label="Background — light mode (optional)"
            value={draft.colors.backgroundLight ?? "#f7f8fa"}
            onChange={(v) => setColor("backgroundLight", v)}
          />
          <ColorField
            id="bg-dark"
            label="Background — dark mode (optional)"
            value={draft.colors.backgroundDark ?? "#0b0b0d"}
            onChange={(v) => setColor("backgroundDark", v)}
          />
          <ColorField
            id="text-light"
            label="Primary text — light mode (optional)"
            value={draft.colors.textPrimaryLight ?? "#101114"}
            onChange={(v) => setColor("textPrimaryLight", v)}
          />
          <ColorField
            id="text-dark"
            label="Primary text — dark mode (optional)"
            value={draft.colors.textPrimaryDark ?? "#f2f3f7"}
            onChange={(v) => setColor("textPrimaryDark", v)}
          />
        </div>
        <div className="space-y-2 px-5 pb-4">
          {accentContrastNow !== null ? (
            <p className="text-caption text-text-muted">
              Light accent vs white text measures {accentContrastNow}:1.
            </p>
          ) : null}
          <ContrastIndicator issues={issues} />
        </div>
      </Card>

      {/* ---- Typography + shape ---- */}
      <Card>
        <CardHeader
          title="Typography & shape"
          description="Fonts come from the approved platform catalog — external font URLs are not supported."
        />
        <div className="grid gap-4 px-5 py-4 sm:grid-cols-2">
          <Field label="Interface font" htmlFor="font">
            <Select
              id="font"
              value={draft.typography.interfaceFont}
              onChange={(e) =>
                update((d) => {
                  d.typography.interfaceFont = e.target
                    .value as TenantTheme["typography"]["interfaceFont"];
                  return d;
                })
              }
            >
              {FONT_CATALOG.map((f) => (
                <option key={f} value={f}>
                  {FONT_LABELS[f] ?? f}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Corner radius profile" htmlFor="radius">
            <Select
              id="radius"
              value={draft.shape.radiusProfile}
              onChange={(e) =>
                update((d) => {
                  d.shape.radiusProfile = e.target
                    .value as TenantTheme["shape"]["radiusProfile"];
                  return d;
                })
              }
            >
              {RADIUS_PROFILES.map((r) => (
                <option key={r} value={r}>
                  {RADIUS_LABELS[r] ?? r}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Card>

      {/* ---- Logo & identity slots ---- */}
      <Card>
        <CardHeader
          title="Logo & identity"
          description={`SVG preferred for logos; transparent backgrounds recommended. Limits: logos ${formatBytes(ASSET_POLICY.logo_horizontal.maxBytes)}, favicon ${formatBytes(ASSET_POLICY.favicon.maxBytes)}.`}
        />
        <ul className="divide-y divide-border-subtle">
          {assets.map((slot) => (
            <AssetSlot key={slot.kind} orgSlug={orgSlug} slot={slot} />
          ))}
        </ul>
      </Card>

      {/* ---- Live preview (shared resolver) ---- */}
      <Card>
        <CardHeader
          title="Preview"
          description="Rendered by the same theme resolver as the live application — light and dark, protected status colors included."
        />
        <div className="px-5 py-4">
          {parsedOk ? (
            <ThemePreview theme={previewTheme} />
          ) : (
            <Alert tone="danger" title="Preview unavailable">
              Fix the invalid color values above to see the preview.
            </Alert>
          )}
        </div>
      </Card>
    </div>
  );
}
