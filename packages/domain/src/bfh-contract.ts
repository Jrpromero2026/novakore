import { z } from "zod";

/**
 * Built For Her integration contract schemas (Phase 1D — CONTRACT ONLY).
 *
 * These types define the versioned payloads NovaKore will accept and emit
 * when the BFH integration is implemented in a later, owner-approved
 * phase. Nothing in this file talks to BFH systems; it exists so the
 * as-built contract in docs/integrations/built-for-her/ is typechecked
 * and testable now, and so webhook/API implementations cannot drift from
 * the documented shapes.
 *
 * Ownership boundary (normative, mirrored in the docs):
 * - NovaKore owns learning content, assessments, attempts, educational
 *   progress, certificates, credentials, and learning events.
 * - BFH owns member subscription, training programs, workouts, readiness,
 *   nutrition, coaching assignments, and BFH business rules. NovaKore is
 *   never the source of truth for those.
 */

export const BFH_CONTRACT_VERSION = 1 as const;

// ---------------------------------------------------------------------------
// Identity handoff (SSO deep link, ADR-012)
// ---------------------------------------------------------------------------

/**
 * Short-lived single-use handoff token minted by NovaKore for a BFH-side
 * signed-in member. BFH exchanges it via the deep-link URL; it is never
 * a session token and never carries BFH health/performance data.
 */
export const identityHandoffClaimsSchema = z.strictObject({
  v: z.literal(BFH_CONTRACT_VERSION),
  /** NovaKore organization the member belongs to. */
  organizationSlug: z.string().min(1).max(63),
  /** BFH's stable external user identifier (opaque to NovaKore). */
  externalUserId: z.string().min(1).max(128),
  email: z.email().max(254),
  displayName: z.string().min(1).max(120).optional(),
  /** Coarse access role BFH asserts; NovaKore maps to system roles. */
  accessLevel: z.enum(["member", "coach", "admin"]),
  /** Unix seconds; tokens are valid ≤ 120s and single-use. */
  issuedAt: z.number().int(),
  expiresAt: z.number().int(),
  nonce: z.string().min(16).max(64),
});
export type IdentityHandoffClaims = z.infer<typeof identityHandoffClaimsSchema>;

// ---------------------------------------------------------------------------
// Inbound API payloads (BFH → NovaKore, org-scoped /v1, API-key auth)
// ---------------------------------------------------------------------------

export const enrollmentRequestSchema = z.strictObject({
  v: z.literal(BFH_CONTRACT_VERSION),
  externalUserId: z.string().min(1).max(128),
  /** Canonical NovaKore target — BFH-side names never appear here. */
  target: z.discriminatedUnion("type", [
    z.strictObject({
      type: z.literal("course"),
      courseSlug: z.string().min(1),
    }),
    z.strictObject({
      type: z.literal("learning_path"),
      pathSlug: z.string().min(1),
    }),
  ]),
  /** Caller-supplied idempotency key; retries must reuse it. */
  idempotencyKey: z.string().min(8).max(128),
});
export type EnrollmentRequest = z.infer<typeof enrollmentRequestSchema>;

export const assignmentRequestSchema = z.strictObject({
  v: z.literal(BFH_CONTRACT_VERSION),
  externalUserId: z.string().min(1).max(128),
  pathSlug: z.string().min(1),
  dueAt: z.iso.datetime().optional(),
  idempotencyKey: z.string().min(8).max(128),
});
export type AssignmentRequest = z.infer<typeof assignmentRequestSchema>;

// ---------------------------------------------------------------------------
// Outbound webhooks (NovaKore → BFH, HMAC-signed, at-least-once + dedupe)
// ---------------------------------------------------------------------------

const webhookBase = z.object({
  v: z.literal(BFH_CONTRACT_VERSION),
  /** The analytics event id — BFH's dedupe key (delivery is at-least-once). */
  eventId: z.uuid(),
  occurredAt: z.iso.datetime(),
  organizationSlug: z.string().min(1).max(63),
  externalUserId: z.string().min(1).max(128),
});

export const completionWebhookSchema = webhookBase.extend({
  type: z.literal("learning.completion"),
  target: z.discriminatedUnion("kind", [
    z.strictObject({
      kind: z.literal("course"),
      courseSlug: z.string().min(1),
      courseVersionNumber: z.number().int().min(1),
    }),
    z.strictObject({
      kind: z.literal("learning_path"),
      pathSlug: z.string().min(1),
    }),
  ]),
});
export type CompletionWebhook = z.infer<typeof completionWebhookSchema>;

export const assessmentResultWebhookSchema = webhookBase.extend({
  type: z.literal("assessment.result"),
  assessmentSlug: z.string().min(1),
  assessmentVersionNumber: z.number().int().min(1),
  attemptNumber: z.number().int().min(1),
  outcome: z.enum(["passed", "failed"]),
  /** Scores cross the boundary only as percentages, never raw answers. */
  scorePercent: z.number().min(0).max(100),
});
export type AssessmentResultWebhook = z.infer<
  typeof assessmentResultWebhookSchema
>;

export const credentialIssuedWebhookSchema = webhookBase.extend({
  type: z.literal("credential.issued"),
  credentialTitle: z.string().min(1).max(200),
  verificationCode: z.string().min(1).max(64),
  issuedAt: z.iso.datetime(),
  expiresAt: z.iso.datetime().nullable(),
});
export type CredentialIssuedWebhook = z.infer<
  typeof credentialIssuedWebhookSchema
>;

export const bfhWebhookSchema = z.discriminatedUnion("type", [
  completionWebhookSchema,
  assessmentResultWebhookSchema,
  credentialIssuedWebhookSchema,
]);
export type BfhWebhook = z.infer<typeof bfhWebhookSchema>;

/**
 * Signature header contract: `X-NovaKore-Signature: v1=<hex hmac-sha256>`
 * over the raw request body with the endpoint's shared secret, plus
 * `X-NovaKore-Timestamp` (reject if |now − ts| > 300s). Verification is
 * implemented with the webhook dispatcher in the integration phase.
 */
export const WEBHOOK_SIGNATURE_HEADER = "X-NovaKore-Signature";
export const WEBHOOK_TIMESTAMP_HEADER = "X-NovaKore-Timestamp";
export const WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS = 300;
