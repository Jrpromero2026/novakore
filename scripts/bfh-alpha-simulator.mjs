#!/usr/bin/env node
/**
 * BFH ↔ NovaKore integration simulator (Validation phase, DEV ONLY).
 *
 * Stands in for the Built For Her application against the NovaKore dev
 * project: it signs identity-handoff tokens exactly as BFH would, calls the
 * `/v1` enrollment/assignment API with the org API key, and runs a webhook
 * receiver that verifies NovaKore's HMAC signatures and dedupes on eventId.
 *
 * It never touches any BFH system. Dev secrets below are the same throwaway
 * values seeded into novakore-dev (bfh_integration_config / organization_api_
 * keys) and are overridable by environment variables. NOT for production.
 *
 * Usage:
 *   node scripts/bfh-alpha-simulator.mjs handoff bfh-member-alpha bfh.member@novakore.test member member
 *   node scripts/bfh-alpha-simulator.mjs enroll bfh-member-alpha learning_path strong-foundations
 *   node scripts/bfh-alpha-simulator.mjs assign bfh-coach-alpha coach-certification-journey
 *   node scripts/bfh-alpha-simulator.mjs receiver 8790 <endpoint-secret>
 *   node scripts/bfh-alpha-simulator.mjs sample-delivery http://localhost:8790 <endpoint-secret>
 */
import crypto from "node:crypto";
import http from "node:http";

const CFG = {
  supabaseUrl:
    process.env.NOVAKORE_TEST_SUPABASE_URL ??
    "https://mivqjcxpfanfzjkwwxcc.supabase.co",
  anonKey: process.env.NOVAKORE_TEST_SUPABASE_ANON_KEY ?? "",
  siteUrl: process.env.NOVAKORE_SITE_URL ?? "http://localhost:3000",
  orgSlug: process.env.BFH_ORG_SLUG ?? "bfh-dev",
  apiKey:
    process.env.BFH_API_KEY ?? "nvk_bfhdev_ZH9x2Qm7Kp4tR8vW3nB6sL1cY0aE5dF",
  handoffSecret:
    process.env.BFH_HANDOFF_SECRET ??
    "bfh-dev-handoff-shared-secret-DO-NOT-USE-IN-PROD",
};

/** Canonical handoff signing input — must match @novakore/domain + the RPC. */
function handoffSigningInput(c) {
  return [
    "v1",
    c.organizationSlug,
    c.externalUserId,
    c.email,
    c.accessLevel,
    [...c.audiences].sort().join(","),
    String(c.issuedAt),
    String(c.expiresAt),
    c.nonce,
  ].join("|");
}

function hmacHex(message, secret) {
  return crypto.createHmac("sha256", secret).update(message).digest("hex");
}

async function cmdHandoff(
  externalUserId,
  email,
  accessLevel,
  audiencesCsv,
  next,
) {
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    v: 1,
    organizationSlug: CFG.orgSlug,
    externalUserId,
    email,
    accessLevel,
    audiences: (audiencesCsv ?? accessLevel).split(",").filter(Boolean),
    issuedAt: now,
    expiresAt: now + 90,
    nonce: crypto.randomBytes(16).toString("hex"),
  };
  const signature = hmacHex(handoffSigningInput(claims), CFG.handoffSecret);
  const res = await fetch(`${CFG.supabaseUrl}/functions/v1/bfh-handoff`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-bfh-debug": "1" },
    body: JSON.stringify({ ...claims, signature, next }),
  });
  console.log("handoff", res.status, await res.text());
}

async function cmdEnrollOrAssign(kind, externalUserId, arg2, arg3) {
  const idempotencyKey = `sim-${kind}-${externalUserId}-${arg3 ?? arg2}`;
  let path, payload;
  if (kind === "enroll") {
    path = "/api/bfh/v1/enroll";
    payload = {
      v: 1,
      externalUserId,
      target:
        arg2 === "course"
          ? { type: "course", courseSlug: arg3 }
          : { type: "learning_path", pathSlug: arg3 },
      idempotencyKey,
    };
  } else {
    path = "/api/bfh/v1/assign";
    payload = { v: 1, externalUserId, pathSlug: arg2, idempotencyKey };
  }
  const res = await fetch(`${CFG.siteUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${CFG.apiKey}`,
    },
    body: JSON.stringify(payload),
  });
  console.log(kind, res.status, await res.text());
}

function cmdReceiver(port, secret) {
  const seen = new Set();
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      const ts = req.headers["x-novakore-timestamp"] ?? "";
      const sigHeader = String(req.headers["x-novakore-signature"] ?? "");
      const expected = "v1=" + hmacHex(`${ts}.${raw}`, secret);
      const okSig =
        sigHeader.length === expected.length &&
        crypto.timingSafeEqual(Buffer.from(sigHeader), Buffer.from(expected));
      const fresh = Math.abs(Date.now() / 1000 - Number(ts)) <= 300;
      let payload = {};
      try {
        payload = JSON.parse(raw);
      } catch {
        /* ignore */
      }
      const duplicate = payload.eventId && seen.has(payload.eventId);
      if (payload.eventId) seen.add(payload.eventId);
      console.log(
        `[receiver] sig=${okSig ? "ok" : "BAD"} fresh=${fresh} dup=${duplicate} type=${payload.type} event=${payload.eventId}`,
      );
      res.writeHead(okSig && fresh ? 200 : 401, {
        "content-type": "application/json",
      });
      res.end(JSON.stringify({ received: okSig && fresh, duplicate }));
    });
  });
  server.listen(Number(port), () =>
    console.log(`[receiver] listening on :${port} (verifying HMAC + dedupe)`),
  );
}

async function cmdSampleDelivery(receiverUrl, secret) {
  const payload = {
    v: 1,
    type: "learning.completion",
    eventId: crypto.randomUUID(),
    occurredAt: new Date().toISOString(),
    organizationSlug: CFG.orgSlug,
    externalUserId: "bfh-member-alpha",
    target: { kind: "learning_path", pathSlug: "strong-foundations" },
  };
  const raw = JSON.stringify(payload);
  const ts = Math.floor(Date.now() / 1000);
  const send = () =>
    fetch(receiverUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-novakore-timestamp": String(ts),
        "x-novakore-signature": "v1=" + hmacHex(`${ts}.${raw}`, secret),
        "x-novakore-delivery": crypto.randomUUID(),
      },
      body: raw,
    }).then(async (r) =>
      console.log("sample-delivery", r.status, await r.text()),
    );
  await send();
  await send(); // second identical eventId -> receiver should mark duplicate
}

const [cmd, ...args] = process.argv.slice(2);
const run = {
  handoff: () => cmdHandoff(...args),
  enroll: () => cmdEnrollOrAssign("enroll", ...args),
  assign: () => cmdEnrollOrAssign("assign", ...args),
  receiver: () => cmdReceiver(args[0] ?? "8790", args[1] ?? ""),
  "sample-delivery": () => cmdSampleDelivery(args[0], args[1]),
}[cmd];
if (!run) {
  console.error(
    "commands: handoff | enroll | assign | receiver | sample-delivery",
  );
  process.exit(1);
}
await run();
