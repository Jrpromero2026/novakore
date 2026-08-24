import "server-only";

/**
 * Honest text extraction for uploaded source files (ADR: extraction is real
 * or absent — never fabricated). Formats:
 *
 *   - text/plain, text/markdown, text/csv  → decoded directly
 *   - application/pdf                      → unpdf (pdf.js text content)
 *   - DOCX                                 → mammoth (raw text)
 *   - images, video                        → NO extraction; the file is
 *     stored and browsable, and the note says exactly that. OCR and
 *     transcription arrive only when a real service is wired.
 *
 * Extracted text is capped at the source_documents.content limit; when the
 * document is longer, the truncation is recorded in the note — silent
 * truncation would misrepresent the source to the model.
 */

export const SOURCE_CONTENT_LIMIT = 100_000;

export const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** MIME → per-type upload cap (bucket backstop is 200MB). */
export const SOURCE_UPLOAD_LIMITS: Record<string, number> = {
  "application/pdf": 20 * 1024 * 1024,
  [DOCX_MIME]: 20 * 1024 * 1024,
  "text/plain": 5 * 1024 * 1024,
  "text/markdown": 5 * 1024 * 1024,
  "text/csv": 10 * 1024 * 1024,
  "image/png": 25 * 1024 * 1024,
  "image/jpeg": 25 * 1024 * 1024,
  "image/webp": 25 * 1024 * 1024,
  "video/mp4": 200 * 1024 * 1024,
  "video/webm": 200 * 1024 * 1024,
  "video/quicktime": 200 * 1024 * 1024,
};

export interface ExtractionResult {
  /** null = extraction does not apply to this format (never a failure). */
  text: string | null;
  /** 'extracted' | 'failed' | 'not_needed' — matches the DB enum. */
  status: "extracted" | "failed" | "not_needed";
  /** Truncation record, failure reason, or why no extraction applies. */
  note: string | null;
  /** Characters extracted BEFORE truncation (honest size of the source). */
  extractedChars: number | null;
}

function bounded(fullText: string): {
  text: string;
  note: string | null;
  extractedChars: number;
} {
  const normalized = fullText.replace(/\r\n/g, "\n").trim();
  if (normalized.length <= SOURCE_CONTENT_LIMIT) {
    return { text: normalized, note: null, extractedChars: normalized.length };
  }
  return {
    text: normalized.slice(0, SOURCE_CONTENT_LIMIT),
    note: `Truncated: the document contains ${normalized.length.toLocaleString()} characters; the first ${SOURCE_CONTENT_LIMIT.toLocaleString()} are stored as source text. The full file remains in storage.`,
    extractedChars: normalized.length,
  };
}

export async function extractSourceText(
  bytes: Uint8Array,
  mimeType: string,
): Promise<ExtractionResult> {
  try {
    if (
      mimeType === "text/plain" ||
      mimeType === "text/markdown" ||
      mimeType === "text/csv"
    ) {
      const decoded = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
      const { text, note, extractedChars } = bounded(decoded);
      if (text.length === 0) {
        return {
          text: null,
          status: "failed",
          note: "The file contains no readable text.",
          extractedChars: 0,
        };
      }
      return { text, status: "extracted", note, extractedChars };
    }

    if (mimeType === "application/pdf") {
      const { extractText } = await import("unpdf");
      const { text, totalPages } = await extractText(bytes, {
        mergePages: true,
      });
      const merged = text; // mergePages: true yields a single string
      if (merged.trim().length === 0) {
        return {
          text: null,
          status: "failed",
          note: `No text layer found across ${totalPages} page(s) — likely a scanned document. OCR is not wired yet; the file itself is stored.`,
          extractedChars: 0,
        };
      }
      const { text: capped, note, extractedChars } = bounded(merged);
      return {
        text: capped,
        status: "extracted",
        note:
          note ??
          `Extracted from ${totalPages} page(s) via the PDF text layer.`,
        extractedChars,
      };
    }

    if (mimeType === DOCX_MIME) {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({
        buffer: Buffer.from(bytes),
      });
      if (result.value.trim().length === 0) {
        return {
          text: null,
          status: "failed",
          note: "The document contains no extractable text.",
          extractedChars: 0,
        };
      }
      const { text, note, extractedChars } = bounded(result.value);
      return { text, status: "extracted", note, extractedChars };
    }

    if (mimeType.startsWith("image/")) {
      return {
        text: null,
        status: "not_needed",
        note: "Image source: stored and browsable. No OCR is wired, so no text is claimed from it.",
        extractedChars: null,
      };
    }
    if (mimeType.startsWith("video/")) {
      return {
        text: null,
        status: "not_needed",
        note: "Video source: stored and browsable. No transcription service is wired, so no transcript is claimed.",
        extractedChars: null,
      };
    }

    return {
      text: null,
      status: "failed",
      note: `Unsupported format for extraction: ${mimeType}.`,
      extractedChars: null,
    };
  } catch (cause) {
    return {
      text: null,
      status: "failed",
      note: `Extraction failed: ${cause instanceof Error ? cause.message.slice(0, 300) : "unknown error"}. The file itself is stored.`,
      extractedChars: null,
    };
  }
}
