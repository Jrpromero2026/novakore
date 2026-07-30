// NovaKore ↔ Built For Her SSO handoff exchange (Validation phase, ADR-012).
//
// The SSO entry point BFH redirects a signed-in member/coach to. It is NOT
// JWT-gated: BFH authenticates by signing the handoff claims with the per-org
// shared secret, and `bfh_exchange_handoff` (service_role) verifies that HMAC
// + timing + single-use nonce INSIDE the database — the secret never leaves
// Postgres. On success the function mints a one-time NovaKore magic link and
// redirects the browser into /auth/callback, which establishes the session
// and lands on the audience-correct deep link. No BFH health/subscription
// data is accepted; only the identity + audience claim crosses.

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SITE_URL = Deno.env.get("NOVAKORE_SITE_URL") ?? "http://localhost:3000";

/** Same-site path under the org's learning tree, or the learning home. */
function safeNext(orgSlug: string, raw: string | null | undefined): string {
  const home = `/${orgSlug}/learn`;
  if (!raw) return home;
  if (!raw.startsWith("/") || raw.startsWith("//")) return home;
  if (raw.includes("..") || raw.includes("\\")) return home;
  if (raw !== home && !raw.startsWith(`${home}/`)) return home;
  return raw;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST")
    return json({ ok: false, status: "method_not_allowed" }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, status: "invalid_json" }, 400);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data, error } = await admin.rpc("bfh_exchange_handoff", {
    p_organization_slug: body.organizationSlug,
    p_external_user_id: body.externalUserId,
    p_email: body.email,
    p_display_name: body.displayName ?? null,
    p_access_level: body.accessLevel,
    p_audiences: body.audiences ?? [],
    p_issued_at: body.issuedAt,
    p_expires_at: body.expiresAt,
    p_nonce: body.nonce,
    p_signature: body.signature,
  });

  if (error)
    return json(
      { ok: false, status: "exchange_error", detail: error.message },
      500,
    );
  const result = data as Record<string, unknown> | null;
  if (!result || result.ok !== true) {
    // 401 for auth/verification failures; the reason is safe to surface.
    return json({ ok: false, status: result?.status ?? "rejected" }, 401);
  }

  const orgSlug = String(body.organizationSlug);
  const deepLink = safeNext(orgSlug, body.next as string | undefined);

  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: String(result.email),
    options: {
      redirectTo: `${SITE_URL}/auth/callback?next=${encodeURIComponent(deepLink)}`,
    },
  });
  if (linkErr || !link?.properties?.action_link) {
    return json({ ok: false, status: "session_mint_failed" }, 500);
  }

  const actionLink = link.properties.action_link;
  // Debug mode lets the dev simulator inspect the outcome without following
  // the one-time link (which would consume it).
  if (req.headers.get("x-bfh-debug") === "1") {
    return json({
      ok: true,
      status: "linked",
      roles: result.roles,
      audiences: result.audiences,
      deepLink,
      actionLink,
    });
  }
  return Response.redirect(actionLink, 302);
});
