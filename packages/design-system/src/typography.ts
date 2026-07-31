/**
 * NovaKore typography system.
 *
 * Primary interface face is Inter (loaded via next/font); monospace is
 * JetBrains Mono. Tenants choose fonts only from the approved catalog
 * (FONT_CATALOG in @novakore/domain) — never arbitrary external font URLs.
 */

export const FONT_FAMILIES = {
  /** Primary interface + display face. */
  sans: `Inter, system-ui, -apple-system, "Segoe UI", sans-serif`,
  /** Code, identifiers, tabular/technical values. */
  mono: `"JetBrains Mono", ui-monospace, "Cascadia Code", Consolas, monospace`,
} as const;

export interface TypeRole {
  /** rem size */
  size: string;
  lineHeight: number;
  weight: number;
  /** Letter spacing; tracking applies only to uppercase labels/metadata. */
  tracking?: string;
  uppercase?: boolean;
}

/** Type roles — mirror of the globals.css `--text-*` theme tokens. */
export const TYPE_ROLES: Record<string, TypeRole> = {
  display: { size: "1.875rem", lineHeight: 1.15, weight: 600 },
  h1: { size: "1.5rem", lineHeight: 1.2, weight: 600 },
  h2: { size: "1.1875rem", lineHeight: 1.25, weight: 600 },
  h3: { size: "1rem", lineHeight: 1.3, weight: 600 },
  title: { size: "0.875rem", lineHeight: 1.35, weight: 550 },
  body: { size: "0.875rem", lineHeight: 1.55, weight: 400 },
  bodySmall: { size: "0.8125rem", lineHeight: 1.5, weight: 400 },
  label: { size: "0.75rem", lineHeight: 1.3, weight: 500 },
  caption: {
    size: "0.6875rem",
    lineHeight: 1.35,
    weight: 500,
    tracking: "0.08em",
    uppercase: true,
  },
  code: { size: "0.8125rem", lineHeight: 1.5, weight: 400 },
};

/** Tracking applied to uppercase labels and metadata only. */
export const TRACKING_CAPS = "0.08em";
