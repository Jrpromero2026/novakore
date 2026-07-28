import { describe, expect, test } from "vitest";
import {
  ASSET_POLICY,
  brandingStoragePath,
  sanitizeFilename,
  validateAssetUpload,
} from "./media";

const png = (
  overrides: Partial<Parameters<typeof validateAssetUpload>[0]> = {},
) => ({
  kind: "logo_horizontal" as const,
  mimeType: "image/png",
  byteSize: 100_000,
  filename: "logo.png",
  width: 480,
  height: 128,
  ...overrides,
});

describe("asset upload validation (ASSET_POLICY)", () => {
  test("accepts a valid logo upload", () => {
    expect(validateAssetUpload(png())).toEqual({ ok: true });
  });

  test("rejects unknown kinds and disallowed MIME types", () => {
    expect(validateAssetUpload(png({ kind: "hero_video" as never })).ok).toBe(
      false,
    );
    for (const mime of [
      "text/html",
      "application/javascript",
      "text/css",
      "application/xml",
      "image/gif", // animated formats not approved
      "application/octet-stream",
    ]) {
      expect(validateAssetUpload(png({ mimeType: mime })).ok).toBe(false);
    }
  });

  test("rejects extension/MIME disagreement (spoofing defense)", () => {
    expect(validateAssetUpload(png({ filename: "logo.svg" })).ok).toBe(false);
    expect(validateAssetUpload(png({ filename: "logo.png.html" })).ok).toBe(
      false,
    );
    expect(validateAssetUpload(png({ filename: "logo" })).ok).toBe(false);
  });

  test("enforces per-kind byte limits and the empty-file case", () => {
    expect(
      validateAssetUpload(
        png({ byteSize: ASSET_POLICY.logo_horizontal.maxBytes + 1 }),
      ).ok,
    ).toBe(false);
    expect(validateAssetUpload(png({ byteSize: 0 })).ok).toBe(false);
    // favicon has the tighter 512 KB ceiling
    expect(
      validateAssetUpload(
        png({
          kind: "favicon",
          byteSize: 600 * 1024,
          filename: "f.png",
          width: 64,
          height: 64,
        }),
      ).ok,
    ).toBe(false);
  });

  test("enforces dimension caps, floors, and squareness", () => {
    expect(validateAssetUpload(png({ width: 6001, height: 100 })).ok).toBe(
      false,
    );
    expect(
      validateAssetUpload(
        png({ kind: "app_icon", width: 256, height: 256, filename: "i.png" }),
      ).ok,
    ).toBe(false); // below 512 floor
    expect(
      validateAssetUpload(
        png({ kind: "app_icon", width: 512, height: 640, filename: "i.png" }),
      ).ok,
    ).toBe(false); // not square
    expect(
      validateAssetUpload(
        png({ kind: "app_icon", width: 512, height: 512, filename: "i.png" }),
      ).ok,
    ).toBe(true);
    expect(validateAssetUpload(png({ width: null, height: null })).ok).toBe(
      false,
    ); // undecodable raster
  });

  test("email logo and app icon refuse SVG (client compatibility)", () => {
    expect(
      validateAssetUpload(
        png({
          kind: "email_logo",
          mimeType: "image/svg+xml",
          filename: "l.svg",
        }),
      ).ok,
    ).toBe(false);
  });
});

describe("filename sanitation and storage paths", () => {
  test("sanitizes hostile filenames (stored XSS / path safety)", () => {
    expect(sanitizeFilename("<img src=x onerror=alert(1)>.png")).toBe(
      "img-src-x-onerror-alert-1.png",
    );
    expect(sanitizeFilename("../../etc/passwd")).toBe("etc-passwd");
    expect(sanitizeFilename("....//weird")).toBe("weird");
    expect(sanitizeFilename("")).toBe("file");
    expect(sanitizeFilename("Ünïcode Løgo.PNG")).toBe("n-code-l-go.png");
  });

  test("builds deterministic tenant-scoped paths; uniqueness from asset id", () => {
    const path = brandingStoragePath({
      organizationId: "00000000-0000-4000-8000-000000000101",
      kind: "favicon",
      assetId: "00000000-0000-4000-8000-00000000abcd",
      filename: "My Icon.png",
    });
    expect(path).toBe(
      "organizations/00000000-0000-4000-8000-000000000101/branding/favicon/00000000-0000-4000-8000-00000000abcd/my-icon.png",
    );
    expect(path.includes("..")).toBe(false);
  });
});
