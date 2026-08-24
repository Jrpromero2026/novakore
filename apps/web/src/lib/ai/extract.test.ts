import { describe, expect, test } from "vitest";
import {
  DOCX_MIME,
  SOURCE_CONTENT_LIMIT,
  SOURCE_UPLOAD_LIMITS,
  extractSourceText,
} from "./extract";

const bytes = (text: string) => new TextEncoder().encode(text);

describe("source text extraction (honest or absent)", () => {
  test("plain text and csv decode directly", async () => {
    const text = await extractSourceText(
      bytes("Line one\r\nLine two"),
      "text/plain",
    );
    expect(text.status).toBe("extracted");
    expect(text.text).toBe("Line one\nLine two");
    expect(text.extractedChars).toBe(17);
    expect(text.note).toBeNull();

    const csv = await extractSourceText(bytes("a,b\n1,2"), "text/csv");
    expect(csv.status).toBe("extracted");
    expect(csv.text).toContain("a,b");
  });

  test("oversized documents truncate WITH a recorded note, never silently", async () => {
    const big = "x".repeat(SOURCE_CONTENT_LIMIT + 5_000);
    const result = await extractSourceText(bytes(big), "text/markdown");
    expect(result.status).toBe("extracted");
    expect(result.text).toHaveLength(SOURCE_CONTENT_LIMIT);
    expect(result.extractedChars).toBe(SOURCE_CONTENT_LIMIT + 5_000);
    expect(result.note).toMatch(/Truncated/);
  });

  test("an empty text file is a failure, not empty success", async () => {
    const result = await extractSourceText(bytes("   \n  "), "text/plain");
    expect(result.status).toBe("failed");
    expect(result.text).toBeNull();
  });

  test("images and video claim no text — stored, not fabricated", async () => {
    const image = await extractSourceText(
      new Uint8Array([1, 2, 3]),
      "image/png",
    );
    expect(image.status).toBe("not_needed");
    expect(image.text).toBeNull();
    expect(image.note).toMatch(/No OCR/);

    const video = await extractSourceText(new Uint8Array([1]), "video/mp4");
    expect(video.status).toBe("not_needed");
    expect(video.note).toMatch(/transcription/i);
  });

  test("a corrupt PDF fails honestly instead of returning garbage", async () => {
    const result = await extractSourceText(
      bytes("this is not a pdf"),
      "application/pdf",
    );
    expect(result.status).toBe("failed");
    expect(result.text).toBeNull();
    expect(result.note).toMatch(/failed|no text layer/i);
  });

  test("every accepted upload type has a size cap", () => {
    for (const [mime, cap] of Object.entries(SOURCE_UPLOAD_LIMITS)) {
      expect(cap).toBeGreaterThan(0);
      expect(cap).toBeLessThanOrEqual(200 * 1024 * 1024);
      expect(mime).toMatch(/\//);
    }
    expect(SOURCE_UPLOAD_LIMITS[DOCX_MIME]).toBeDefined();
  });
});
