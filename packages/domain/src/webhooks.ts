/**
 * Webhook destination policy + signing contract (Phase 2, ADR-026).
 * Pure functions — the Edge Function worker and tests share them.
 */

export const WEBHOOK_SIGNATURE_VERSION = "v1" as const;
export const WEBHOOK_TIMEOUT_MS = 10_000;
export const WEBHOOK_MAX_RESPONSE_BYTES = 4_096;
export const WEBHOOK_MAX_ATTEMPTS = 6;

/** Bounded exponential backoff in seconds: 1m, 5m, 25m, capped at 2h. */
export function backoffSeconds(attempt: number): number {
  return Math.min(60 * 5 ** Math.max(0, attempt - 1), 7_200);
}

/**
 * Canonical signing input: `${timestamp}.${rawBody}` signed with
 * HMAC-SHA256 using the endpoint secret; header value `v1=<hex>`.
 * (The worker performs the actual HMAC via WebCrypto.)
 */
export function signingInput(
  timestampSeconds: number,
  rawBody: string,
): string {
  return `${timestampSeconds}.${rawBody}`;
}

export interface DestinationVerdict {
  allowed: boolean;
  reason: string | null;
}

const PRIVATE_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^0\.0\.0\.0$/,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^169\.254\./, // link-local + cloud metadata range
  /^\[?::1\]?$/,
  /^\[?f[cd][0-9a-f]{2}:/i, // IPv6 ULA
  /^\[?fe80:/i, // IPv6 link-local
  /\.internal$/i,
  /\.local$/i,
];

export const METADATA_HOSTS = [
  "169.254.169.254",
  "metadata.google.internal",
  "metadata.azure.com",
];

/**
 * Static destination policy (SSRF first line). The worker ALSO re-checks
 * resolved addresses after DNS resolution and refuses redirects.
 */
export function checkWebhookDestination(
  rawUrl: string,
  options: { allowLocalhost?: boolean } = {},
): DestinationVerdict {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { allowed: false, reason: "not a valid URL" };
  }
  const host = url.hostname;
  const isLocalhost = /^localhost$/i.test(host) || /^127\./.test(host);
  if (url.protocol !== "https:") {
    // documented development exception: plain HTTP to localhost only
    if (!(url.protocol === "http:" && isLocalhost && options.allowLocalhost)) {
      return { allowed: false, reason: "destinations must use https" };
    }
  }
  if (METADATA_HOSTS.includes(host.toLowerCase())) {
    return {
      allowed: false,
      reason: "metadata-service destinations are blocked",
    };
  }
  if (isLocalhost && options.allowLocalhost) {
    return { allowed: true, reason: null };
  }
  for (const pattern of PRIVATE_HOST_PATTERNS) {
    if (pattern.test(host)) {
      return {
        allowed: false,
        reason:
          "loopback, link-local, and private-network destinations are blocked",
      };
    }
  }
  if (url.username || url.password) {
    return { allowed: false, reason: "credentials in URLs are not allowed" };
  }
  return { allowed: true, reason: null };
}

/** Post-resolution check the worker applies to every resolved IP. */
export function isForbiddenResolvedAddress(ip: string): boolean {
  return (
    PRIVATE_HOST_PATTERNS.some((p) => p.test(ip)) || METADATA_HOSTS.includes(ip)
  );
}

/** Strip obvious secrets from response excerpts before storage. */
export function redactResponseExcerpt(body: string): string {
  return body
    .slice(0, WEBHOOK_MAX_RESPONSE_BYTES)
    .replace(
      /("?(?:authorization|api[-_]?key|secret|token|password)"?\s*[:=]\s*)("(?:[^"\\]|\\.)*"|[^\s",}]+)/gi,
      '$1"[redacted]"',
    );
}
