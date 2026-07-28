/**
 * Media asset policy (ADR-015, logo-asset-specification.md).
 *
 * Explicit constants — no magic numbers in application code. Server-side
 * validation is authoritative; client checks are advisory UX only.
 */

export const ASSET_KINDS = [
  "logo_horizontal",
  "logo_horizontal_inverse",
  "monogram",
  "favicon",
  "app_icon",
  "email_logo",
  "content_image",
] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

export const ASSET_STATUSES = [
  "pending",
  "active",
  "replaced",
  "archived",
  "failed",
] as const;
export type AssetStatus = (typeof ASSET_STATUSES)[number];

const KB = 1024;
const MB = 1024 * KB;

/** Global ceiling regardless of kind (decompression/abuse guard). */
export const MAX_RASTER_DIMENSION = 6000;

export interface AssetKindPolicy {
  /** Why: storage-cost + decompression-bomb ceiling per slot. */
  maxBytes: number;
  /** Allowed MIME types (must agree with extension AND decoded type). */
  mimeTypes: readonly string[];
  /** Render-quality floors where a slot demands them. */
  minWidth?: number;
  minHeight?: number;
  /** Slots that must be square (favicon/app icon rendering targets). */
  requireSquare?: boolean;
}

export const ASSET_POLICY: Record<AssetKind, AssetKindPolicy> = {
  logo_horizontal: {
    maxBytes: 2 * MB,
    mimeTypes: ["image/svg+xml", "image/png", "image/webp"],
  },
  logo_horizontal_inverse: {
    maxBytes: 2 * MB,
    mimeTypes: ["image/svg+xml", "image/png", "image/webp"],
  },
  monogram: {
    maxBytes: 2 * MB,
    mimeTypes: ["image/svg+xml", "image/png", "image/webp"],
    requireSquare: true,
  },
  favicon: {
    // ICO permitted solely for legacy browser compatibility.
    maxBytes: 512 * KB,
    mimeTypes: [
      "image/svg+xml",
      "image/png",
      "image/x-icon",
      "image/vnd.microsoft.icon",
    ],
    minWidth: 48,
    minHeight: 48,
    requireSquare: true,
  },
  app_icon: {
    // Raster only: OS icon targets do not reliably accept SVG.
    maxBytes: 2 * MB,
    mimeTypes: ["image/png", "image/webp"],
    minWidth: 512,
    minHeight: 512,
    requireSquare: true,
  },
  email_logo: {
    // Raster only: email clients do not reliably render SVG.
    maxBytes: 2 * MB,
    mimeTypes: ["image/png", "image/webp"],
    minWidth: 240,
  },
  content_image: {
    maxBytes: 8 * MB,
    mimeTypes: ["image/jpeg", "image/png", "image/webp"],
  },
};

/** Extension ↔ MIME agreement table (spoofing defense, one direction of it). */
export const MIME_EXTENSIONS: Record<string, readonly string[]> = {
  "image/svg+xml": ["svg"],
  "image/png": ["png"],
  "image/webp": ["webp"],
  "image/jpeg": ["jpg", "jpeg"],
  "image/x-icon": ["ico"],
  "image/vnd.microsoft.icon": ["ico"],
};

/** Branding slots (everything except content images). */
export const BRANDING_ASSET_KINDS = ASSET_KINDS.filter(
  (k) => k !== "content_image",
) as readonly AssetKind[];

export interface AssetUploadCandidate {
  kind: AssetKind;
  mimeType: string;
  byteSize: number;
  filename: string;
  /** Decoded dimensions; null for SVG (vector) and ICO containers. */
  width: number | null;
  height: number | null;
}

export type AssetValidation = { ok: true } | { ok: false; error: string };

export function validateAssetUpload(
  candidate: AssetUploadCandidate,
): AssetValidation {
  const policy = ASSET_POLICY[candidate.kind];
  if (!policy) return { ok: false, error: "Unknown asset kind." };

  if (!policy.mimeTypes.includes(candidate.mimeType)) {
    return {
      ok: false,
      error: `This slot does not accept ${candidate.mimeType || "that file type"}.`,
    };
  }

  const extension = candidate.filename.split(".").pop()?.toLowerCase() ?? "";
  const allowedExtensions = MIME_EXTENSIONS[candidate.mimeType] ?? [];
  if (!allowedExtensions.includes(extension)) {
    return {
      ok: false,
      error: "The file extension does not match its content type.",
    };
  }

  if (candidate.byteSize <= 0)
    return { ok: false, error: "The file is empty." };
  if (candidate.byteSize > policy.maxBytes) {
    return {
      ok: false,
      error: `File is too large (limit ${formatBytes(policy.maxBytes)} for this slot).`,
    };
  }

  const isVector = candidate.mimeType === "image/svg+xml";
  const isIcoContainer =
    candidate.mimeType === "image/x-icon" ||
    candidate.mimeType === "image/vnd.microsoft.icon";

  if (!isVector && !isIcoContainer) {
    if (candidate.width === null || candidate.height === null) {
      return { ok: false, error: "The image could not be decoded." };
    }
    if (
      candidate.width > MAX_RASTER_DIMENSION ||
      candidate.height > MAX_RASTER_DIMENSION
    ) {
      return {
        ok: false,
        error: `Image dimensions exceed ${MAX_RASTER_DIMENSION}×${MAX_RASTER_DIMENSION}.`,
      };
    }
    if (
      (policy.minWidth && candidate.width < policy.minWidth) ||
      (policy.minHeight && candidate.height < policy.minHeight)
    ) {
      return {
        ok: false,
        error: `This slot needs at least ${policy.minWidth ?? 1}×${policy.minHeight ?? 1} pixels.`,
      };
    }
    if (policy.requireSquare && candidate.width !== candidate.height) {
      return { ok: false, error: "This slot requires a square image." };
    }
  }

  return { ok: true };
}

export function formatBytes(bytes: number): string {
  if (bytes >= MB)
    return `${(bytes / MB).toFixed(bytes % MB === 0 ? 0 : 1)} MB`;
  if (bytes >= KB) return `${Math.round(bytes / KB)} KB`;
  return `${bytes} B`;
}

/**
 * Display-name sanitation for stored filenames (stored-XSS + path-safety):
 * safe charset, single dots, length-capped. Uniqueness always comes from
 * the asset id, never from this name.
 */
export function sanitizeFilename(original: string): string {
  const trimmed = original.trim().slice(-120);
  const base = trimmed
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/\.{2,}/g, ".")
    .replace(/-*\.-*/g, ".");
  const cleaned = base.replace(/^[-.]+|[-.]+$/g, "");
  return cleaned.length > 0 ? cleaned.toLowerCase() : "file";
}

/** Deterministic tenant-scoped storage path (media-assets.md §4). */
export function brandingStoragePath(input: {
  organizationId: string;
  kind: AssetKind;
  assetId: string;
  filename: string;
}): string {
  return `organizations/${input.organizationId}/branding/${input.kind}/${input.assetId}/${sanitizeFilename(input.filename)}`;
}
