/**
 * Asset security gates (logo-asset-specification.md §3, media-assets.md §7).
 *
 * SVG is treated as HOSTILE INPUT. Strategy is reject-not-rewrite: any
 * dangerous construct refuses the upload outright; we never attempt to
 * "clean" attacker-controlled markup. Rendering is additionally restricted
 * to <img src> (scripts do not execute in image contexts) and private
 * buckets with signed URLs.
 */

export type SvgVerdict = { ok: true } | { ok: false; reason: string };

const SVG_REJECT_PATTERNS: { pattern: RegExp; reason: string }[] = [
  { pattern: /<script/i, reason: "scripts are not allowed in SVG uploads" },
  {
    pattern: /<foreignobject/i,
    reason: "foreignObject is not allowed in SVG uploads",
  },
  {
    pattern: /\son[a-z]+\s*=/i,
    reason: "event handler attributes are not allowed",
  },
  { pattern: /javascript:/i, reason: "javascript: URLs are not allowed" },
  { pattern: /<!doctype/i, reason: "DOCTYPE declarations are not allowed" },
  { pattern: /<!entity/i, reason: "entity declarations are not allowed" },
  {
    pattern: /<\?(?!xml[\s?])/i,
    reason: "processing instructions are not allowed",
  },
  {
    pattern: /<(image|iframe|embed|object|audio|video)\b/i,
    reason: "embedded media elements are not allowed",
  },
  { pattern: /@import/i, reason: "style imports are not allowed" },
  {
    pattern: /url\s*\(\s*['"]?\s*(?!#)/i,
    reason: "external url() references are not allowed",
  },
  // href/xlink:href may only point at same-document fragments (#id)
  {
    pattern: /(xlink:href|href)\s*=\s*['"](?!#)/i,
    reason: "external references are not allowed",
  },
];

export function validateSvgContent(svgText: string): SvgVerdict {
  if (!/<svg[\s>]/i.test(svgText)) {
    return {
      ok: false,
      reason: "the file does not contain an <svg> root element",
    };
  }
  for (const { pattern, reason } of SVG_REJECT_PATTERNS) {
    if (pattern.test(svgText)) return { ok: false, reason };
  }
  return { ok: true };
}

/** Magic-byte check: the declared MIME must match what the bytes say. */
export function sniffImageMime(bytes: Uint8Array): string | null {
  const startsWith = (sig: number[], offset = 0) =>
    sig.every((b, i) => bytes[offset + i] === b);

  if (startsWith([0x89, 0x50, 0x4e, 0x47])) return "image/png";
  if (startsWith([0xff, 0xd8, 0xff])) return "image/jpeg";
  if (
    startsWith([0x52, 0x49, 0x46, 0x46]) &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  if (startsWith([0x00, 0x00, 0x01, 0x00])) return "image/x-icon";
  // SVG: text-based; look for an svg root in the first chunk
  const head = new TextDecoder("utf-8", { fatal: false })
    .decode(bytes.slice(0, 512))
    .trimStart();
  if (
    /^(<\?xml[\s\S]{0,200}?)?\s*<svg[\s>]/i.test(head) ||
    /^<svg[\s>]/i.test(head)
  ) {
    return "image/svg+xml";
  }
  return null;
}

/** True when declared MIME and sniffed content agree (ICO aliases allowed). */
export function mimeAgreesWithBytes(
  declared: string,
  bytes: Uint8Array,
): boolean {
  const sniffed = sniffImageMime(bytes);
  if (!sniffed) return false;
  if (sniffed === declared) return true;
  const icoAliases = ["image/x-icon", "image/vnd.microsoft.icon"];
  return icoAliases.includes(declared) && icoAliases.includes(sniffed);
}
