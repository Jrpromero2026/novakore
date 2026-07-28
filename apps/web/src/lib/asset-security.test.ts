import { describe, expect, test } from "vitest";
import {
  mimeAgreesWithBytes,
  sniffImageMime,
  validateSvgContent,
} from "./asset-security";

const CLEAN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
  <rect x="1" y="1" width="22" height="22" rx="5" fill="#5a5cff"/>
  <path d="M7 17V7l9 10V7" fill="none" stroke="#fff"/>
  <use href="#frag"/>
</svg>`;

describe("SVG hostile-input gate (reject, never rewrite)", () => {
  test("accepts a clean vector logo", () => {
    expect(validateSvgContent(CLEAN_SVG)).toEqual({ ok: true });
  });

  test("rejects script payloads", () => {
    expect(
      validateSvgContent(`<svg><script>alert(document.cookie)</script></svg>`)
        .ok,
    ).toBe(false);
    expect(validateSvgContent(`<svg><SCRIPT href="x"></SCRIPT></svg>`).ok).toBe(
      false,
    );
  });

  test("rejects event handlers and javascript: URLs", () => {
    expect(validateSvgContent(`<svg onload="alert(1)"></svg>`).ok).toBe(false);
    expect(
      validateSvgContent(`<svg><a href="javascript:alert(1)">x</a></svg>`).ok,
    ).toBe(false);
  });

  test("rejects foreignObject, embedded media, and external references", () => {
    expect(
      validateSvgContent(`<svg><foreignObject><body/></foreignObject></svg>`)
        .ok,
    ).toBe(false);
    expect(
      validateSvgContent(
        `<svg><image href="https://evil.example/x.png"/></svg>`,
      ).ok,
    ).toBe(false);
    expect(
      validateSvgContent(
        `<svg><use xlink:href="https://evil.example#x"/></svg>`,
      ).ok,
    ).toBe(false);
  });

  test("rejects DOCTYPE/entity declarations and style imports (XXE / exfil)", () => {
    expect(
      validateSvgContent(
        `<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]><svg>&x;</svg>`,
      ).ok,
    ).toBe(false);
    expect(
      validateSvgContent(
        `<svg><style>@import url(https://evil.example/x.css)</style></svg>`,
      ).ok,
    ).toBe(false);
    expect(
      validateSvgContent(
        `<svg><style>.a{background:url(https://evil.example)}</style></svg>`,
      ).ok,
    ).toBe(false);
  });

  test("rejects non-SVG content presented as SVG", () => {
    expect(validateSvgContent(`<html><body>hi</body></html>`).ok).toBe(false);
    expect(validateSvgContent(``).ok).toBe(false);
  });
});

describe("MIME sniffing (spoofing defense)", () => {
  const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
  const HTML = new TextEncoder().encode("<html><script>alert(1)</script>");

  test("identifies real image bytes", () => {
    expect(sniffImageMime(PNG)).toBe("image/png");
    expect(sniffImageMime(JPEG)).toBe("image/jpeg");
    expect(sniffImageMime(new TextEncoder().encode(CLEAN_SVG))).toBe(
      "image/svg+xml",
    );
  });

  test("declared type must agree with the bytes", () => {
    expect(mimeAgreesWithBytes("image/png", PNG)).toBe(true);
    expect(mimeAgreesWithBytes("image/png", JPEG)).toBe(false); // spoofed
    expect(mimeAgreesWithBytes("image/png", HTML)).toBe(false); // HTML as PNG
    expect(mimeAgreesWithBytes("image/svg+xml", HTML)).toBe(false); // HTML as SVG
  });
});
