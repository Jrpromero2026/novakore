// NovaKore webhook delivery worker (Phase 2, ADR-025/026).
//
// A scheduled Supabase Edge Function that drains the transactional outbox
// into signed HTTPS webhook deliveries. It claims pending deliveries
// atomically (SKIP LOCKED inside app.claim_webhook_deliveries), signs each
// payload with the endpoint secret, enforces SSRF policy + timeout +
// response-size limits, applies bounded exponential backoff on retryable
// failures, and dead-letters after the attempt budget. Uses the
// service-role key from the function environment (NEVER exposed to any
// client).
//
// Schedule (remote): configure a cron trigger in the Supabase dashboard
// (e.g. every minute) OR invoke via pg_cron/http. Local invocation for
// tests: POST to the served function. See docs/architecture/outbox-worker.md.

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ALLOW_LOCALHOST =
  Deno.env.get("NOVAKORE_WEBHOOK_ALLOW_LOCALHOST") === "1";

const TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 4_096;
const MAX_ATTEMPTS = 6;

const METADATA_HOSTS = [
  "169.254.169.254",
  "metadata.google.internal",
  "metadata.azure.com",
];
const PRIVATE_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^0\.0\.0\.0$/,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^169\.254\./,
  /^\[?::1\]?$/,
  /^\[?f[cd][0-9a-f]{2}:/i,
  /^\[?fe80:/i,
  /\.internal$/i,
  /\.local$/i,
];

function checkDestination(rawUrl: string): {
  allowed: boolean;
  reason: string | null;
} {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { allowed: false, reason: "invalid URL" };
  }
  const host = url.hostname;
  const isLocalhost = /^localhost$/i.test(host) || /^127\./.test(host);
  if (url.protocol !== "https:") {
    if (!(url.protocol === "http:" && isLocalhost && ALLOW_LOCALHOST)) {
      return { allowed: false, reason: "destinations must use https" };
    }
  }
  if (METADATA_HOSTS.includes(host.toLowerCase())) {
    return { allowed: false, reason: "metadata destination blocked" };
  }
  if (isLocalhost && ALLOW_LOCALHOST) return { allowed: true, reason: null };
  if (PRIVATE_HOST_PATTERNS.some((p) => p.test(host))) {
    return { allowed: false, reason: "private-network destination blocked" };
  }
  if (url.username || url.password) {
    return { allowed: false, reason: "credentials in URL" };
  }
  return { allowed: true, reason: null };
}

function backoffSeconds(attempt: number): number {
  return Math.min(60 * 5 ** Math.max(0, attempt - 1), 7_200);
}

function redact(body: string): string {
  return body
    .slice(0, MAX_RESPONSE_BYTES)
    .replace(
      /("?(?:authorization|api[-_]?key|secret|token|password)"?\s*[:=]\s*)("(?:[^"\\]|\\.)*"|[^\s",}]+)/gi,
      '$1"[redacted]"',
    );
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(message),
  );
  return [...new Uint8Array(sig)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function processDelivery(
  admin: ReturnType<typeof createClient>,
  delivery: Record<string, unknown>,
): Promise<string> {
  const deliveryId = delivery.id as string;

  // load endpoint + payload
  const [{ data: endpoint }, { data: outbox }] = await Promise.all([
    admin
      .from("webhook_endpoints")
      .select("url, secret, status")
      .eq("id", delivery.endpoint_id)
      .single(),
    admin
      .from("outbox_events")
      .select("payload")
      .eq("id", delivery.outbox_event_id)
      .single(),
  ]);

  if (!endpoint || endpoint.status !== "active") {
    await admin.rpc("worker_settle_webhook_delivery", {
      p_delivery_id: deliveryId,
      p_outcome: "dead_letter",
      p_error: "endpoint is not active",
    });
    return "dead_letter";
  }

  const verdict = checkDestination(endpoint.url as string);
  if (!verdict.allowed) {
    await admin.rpc("worker_settle_webhook_delivery", {
      p_delivery_id: deliveryId,
      p_outcome: "dead_letter",
      p_error: `blocked destination: ${verdict.reason}`,
    });
    return "dead_letter";
  }

  const rawBody = JSON.stringify(outbox?.payload ?? {});
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = await hmacHex(
    endpoint.secret as string,
    `${timestamp}.${rawBody}`,
  );
  const attempt = delivery.attempt_count as number;

  try {
    const response = await fetch(endpoint.url as string, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-novakore-signature": `v1=${signature}`,
        "x-novakore-timestamp": String(timestamp),
        "x-novakore-delivery": deliveryId,
      },
      body: rawBody,
      redirect: "error", // no redirect-based SSRF
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const text = redact(await response.text());
    if (response.ok) {
      await admin.rpc("worker_settle_webhook_delivery", {
        p_delivery_id: deliveryId,
        p_outcome: "delivered",
        p_response_status: response.status,
        p_response_excerpt: text,
      });
      return "delivered";
    }
    // 4xx (except 429) is permanent; 5xx/429 retry within budget
    const retryable = response.status === 429 || response.status >= 500;
    if (retryable && attempt < MAX_ATTEMPTS) {
      await admin.rpc("worker_settle_webhook_delivery", {
        p_delivery_id: deliveryId,
        p_outcome: "retry",
        p_response_status: response.status,
        p_response_excerpt: text,
        p_error: `HTTP ${response.status}`,
        p_backoff_seconds: backoffSeconds(attempt),
      });
      return "retry";
    }
    await admin.rpc("worker_settle_webhook_delivery", {
      p_delivery_id: deliveryId,
      p_outcome: "dead_letter",
      p_response_status: response.status,
      p_response_excerpt: text,
      p_error: `HTTP ${response.status}`,
    });
    return "dead_letter";
  } catch (cause) {
    const message =
      cause instanceof Error ? cause.message.slice(0, 200) : "request failed";
    if (attempt < MAX_ATTEMPTS) {
      await admin.rpc("worker_settle_webhook_delivery", {
        p_delivery_id: deliveryId,
        p_outcome: "retry",
        p_error: message,
        p_backoff_seconds: backoffSeconds(attempt),
      });
      return "retry";
    }
    await admin.rpc("worker_settle_webhook_delivery", {
      p_delivery_id: deliveryId,
      p_outcome: "dead_letter",
      p_error: message,
    });
    return "dead_letter";
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("method not allowed", { status: 405 });
  }
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data: claimed, error } = await admin.rpc(
    "worker_claim_webhook_deliveries",
    { p_limit: 20 },
  );
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }

  const results = { delivered: 0, retry: 0, dead_letter: 0 };
  for (const delivery of (claimed ?? []) as Record<string, unknown>[]) {
    const outcome = await processDelivery(admin, delivery);
    results[outcome as keyof typeof results] += 1;
  }

  return new Response(
    JSON.stringify({ claimed: (claimed ?? []).length, results }),
    {
      headers: { "content-type": "application/json" },
    },
  );
});
