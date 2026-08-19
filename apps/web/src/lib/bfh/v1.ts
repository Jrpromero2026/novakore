import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * BFH inbound `/v1` API helpers. These endpoints are authenticated by the
 * per-org API key (Bearer), which `bfh_enroll_or_assign_external` verifies
 * internally — so the call runs through an anon (session-less) client, exactly
 * like the public verify_credential surface. No user session is involved.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;

export function bfhApiClient() {
  return createClient(url, anonKey, { auth: { persistSession: false } });
}

/** Extract the Bearer API key, or null if absent/malformed. */
export function bearerKey(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

/** Map the RPC's business status to an HTTP status code. */
export function statusToHttp(status: string | undefined): number {
  switch (status) {
    case "created":
      return 201;
    case "conflict":
      return 409;
    case "forbidden":
      return 403;
    case "not_found":
      return 404;
    case "unauthorized":
      return 401;
    case "invalid":
      return 400;
    case "rate_limited":
      return 429;
    default:
      return 200; // ok / idempotent replay
  }
}

export interface EnrollOrAssignArgs {
  apiKey: string;
  kind: "enroll" | "assign";
  externalUserId: string;
  targetType: "course" | "learning_path";
  targetSlug: string;
  dueAt: string | null;
  idempotencyKey: string;
}

export async function enrollOrAssign(args: EnrollOrAssignArgs) {
  const supabase = bfhApiClient();
  const { data, error } = await supabase.rpc("bfh_enroll_or_assign_external", {
    p_api_key: args.apiKey,
    p_kind: args.kind,
    p_external_user_id: args.externalUserId,
    p_target_type: args.targetType,
    p_target_slug: args.targetSlug,
    p_due_at: args.dueAt,
    p_idempotency_key: args.idempotencyKey,
  });
  if (error) return { httpStatus: 500, body: { ok: false, status: "error" } };
  const result = (data ?? { status: "error", ok: false }) as {
    status?: string;
    retryAfter?: number;
  };
  // A 429 without Retry-After tells a client to back off by guessing. The
  // window remainder is known, so send it.
  const headers =
    result.status === "rate_limited"
      ? { "Retry-After": String(Math.max(result.retryAfter ?? 1, 1)) }
      : undefined;
  return { httpStatus: statusToHttp(result.status), body: result, headers };
}
