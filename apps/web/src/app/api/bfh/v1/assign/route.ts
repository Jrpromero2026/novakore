import type { NextRequest } from "next/server";
import { assignmentRequestSchema } from "@novakore/domain";
import { bearerKey, enrollOrAssign } from "@/lib/bfh/v1";

/**
 * BFH → NovaKore learning-assignment API (contract §4): assign a Journey
 * (learning_path) with an optional due date. API-key auth; idempotent;
 * audience-gated so a Journey reaches only its audience.
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

  const parsed = assignmentRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json(
      { ok: false, status: "invalid", code: "schema" },
      { status: 400 },
    );
  }

  const { externalUserId, pathSlug, dueAt, idempotencyKey } = parsed.data;
  const { httpStatus, body } = await enrollOrAssign({
    apiKey,
    kind: "assign",
    externalUserId,
    targetType: "learning_path",
    targetSlug: pathSlug,
    dueAt: dueAt ?? null,
    idempotencyKey,
  });
  return Response.json(body, { status: httpStatus });
}
