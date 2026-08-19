import type { NextRequest } from "next/server";
import { enrollmentRequestSchema } from "@novakore/domain";
import { bearerKey, enrollOrAssign } from "@/lib/bfh/v1";

/**
 * BFH → NovaKore enrollment API (contract §4). API-key (Bearer) auth;
 * idempotent on `idempotencyKey`; 409 on an existing live enrollment;
 * audience-gated for Journey (learning_path) targets.
 */
export async function POST(request: NextRequest) {
  const apiKey = bearerKey(request);
  if (!apiKey) {
    return Response.json(
      { ok: false, status: "unauthorized" },
      { status: 401 },
    );
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json(
      { ok: false, status: "invalid", code: "bad_json" },
      { status: 400 },
    );
  }

  const parsed = enrollmentRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json(
      { ok: false, status: "invalid", code: "schema" },
      { status: 400 },
    );
  }

  const { externalUserId, target, idempotencyKey } = parsed.data;
  const { httpStatus, body, headers } = await enrollOrAssign({
    apiKey,
    kind: "enroll",
    externalUserId,
    targetType: target.type,
    targetSlug: target.type === "course" ? target.courseSlug : target.pathSlug,
    dueAt: null,
    idempotencyKey,
  });
  return Response.json(body, { status: httpStatus, headers });
}
