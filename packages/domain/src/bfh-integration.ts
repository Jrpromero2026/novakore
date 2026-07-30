/**
 * Built For Her integration logic (Validation phase — BFH Academy alpha).
 *
 * Pure functions that implement NovaKore's side of the frozen BFH contract
 * (`bfh-contract.ts`): the access-level → system-role mapping, identity
 * handoff claim verification (structure + timing; the HMAC signature check
 * happens in the handoff Edge Function, which holds the secret), safe
 * deep-link resolution, and the outbound-webhook projection builders that
 * turn NovaKore's own learning facts into the contract's payload shapes.
 *
 * This is integration glue, not business logic: NovaKore expresses its own
 * events in the contract's vocabulary. No BFH health/subscription/training
 * concept appears here, and nothing in this file performs I/O.
 */

import {
  BFH_CONTRACT_VERSION,
  type BfhAudience,
  identityHandoffClaimsSchema,
  type IdentityHandoffClaims,
  completionWebhookSchema,
  type CompletionWebhook,
  assessmentResultWebhookSchema,
  type AssessmentResultWebhook,
  credentialIssuedWebhookSchema,
  type CredentialIssuedWebhook,
  type BfhWebhook,
} from "./bfh-contract";
import type { EventType } from "./learning";

// ---------------------------------------------------------------------------
// Access-level → system-role mapping (README §3)
// ---------------------------------------------------------------------------

/**
 * BFH asserts a coarse access level; NovaKore maps it to exactly one system
 * role KEY and enforces its own permission catalog. A BFH claim can never
 * mint permissions outside these bundles.
 */
export const BFH_ACCESS_LEVEL_TO_ROLE_KEY = {
  member: "learner",
  coach: "instructor",
  admin: "organization_admin",
} as const;

export type BfhAccessLevel = keyof typeof BFH_ACCESS_LEVEL_TO_ROLE_KEY;
export type MappedRoleKey =
  (typeof BFH_ACCESS_LEVEL_TO_ROLE_KEY)[BfhAccessLevel];

export function mapAccessLevelToRoleKey(level: BfhAccessLevel): MappedRoleKey {
  return BFH_ACCESS_LEVEL_TO_ROLE_KEY[level];
}

/**
 * Resolve the NovaKore system roles for a handoff. Any learning audience
 * grants `learner` (audiences share the consuming role); the app role adds
 * the serving/admin role (coach → instructor, admin → organization_admin).
 * A member with the member audience is simply a learner. Mirrors
 * `bfh_exchange_handoff` in SQL.
 */
export function rolesForHandoff(
  accessLevel: BfhAccessLevel,
  audiences: readonly BfhAudience[],
): string[] {
  const roles = new Set<string>();
  if (audiences.length > 0) roles.add("learner");
  if (accessLevel === "coach") roles.add("instructor");
  else if (accessLevel === "admin") roles.add("organization_admin");
  else if (accessLevel === "member") roles.add("learner");
  return [...roles];
}

/**
 * A Journey tagged with an audience reaches only people who hold that
 * audience. Untagged Journeys (null) are open to any learner. This is the
 * single eligibility rule enforced in the enrollment/assignment RPC.
 */
export function isEligibleForAudience(
  userAudiences: readonly BfhAudience[],
  journeyAudience: BfhAudience | null,
): boolean {
  if (journeyAudience === null) return true;
  return userAudiences.includes(journeyAudience);
}

// ---------------------------------------------------------------------------
// Identity handoff verification (structure + timing)
// ---------------------------------------------------------------------------

/** Handoff tokens are single-use and valid for at most this long (ADR-012). */
export const HANDOFF_MAX_LIFETIME_SECONDS = 120;

/**
 * Canonical HMAC signing input for a handoff token. BFH signs this exact
 * string with the per-org shared secret; `bfh_exchange_handoff` rebuilds and
 * verifies it. Audiences are sorted ascending so array order never matters.
 * Format: v1|orgSlug|externalUserId|email|accessLevel|audiencesCsv|issuedAt|expiresAt|nonce
 */
export function handoffSigningInput(claims: {
  organizationSlug: string;
  externalUserId: string;
  email: string;
  accessLevel: BfhAccessLevel;
  audiences: readonly BfhAudience[];
  issuedAt: number;
  expiresAt: number;
  nonce: string;
}): string {
  return [
    "v1",
    claims.organizationSlug,
    claims.externalUserId,
    claims.email,
    claims.accessLevel,
    [...claims.audiences].sort().join(","),
    String(claims.issuedAt),
    String(claims.expiresAt),
    claims.nonce,
  ].join("|");
}

export type HandoffVerification =
  { ok: true; claims: IdentityHandoffClaims } | { ok: false; reason: string };

/**
 * Validate handoff claims' shape and timing. Returns a discriminated result
 * rather than throwing so the caller can log a reason and fail closed.
 *
 * The signature (HMAC over the raw claims body with the per-org secret) and
 * the single-use nonce are enforced by the caller — the Edge Function that
 * holds the secret and the `bfh_handoff_nonces` table respectively. This
 * function is the deterministic, testable core of that check.
 */
export function verifyHandoffClaims(
  input: unknown,
  nowSeconds: number,
  options: { clockSkewSeconds?: number } = {},
): HandoffVerification {
  const parsed = identityHandoffClaimsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, reason: "malformed handoff claims" };
  }
  const claims = parsed.data;
  const skew = options.clockSkewSeconds ?? 5;

  if (claims.expiresAt <= claims.issuedAt) {
    return { ok: false, reason: "expiresAt must be after issuedAt" };
  }
  if (claims.expiresAt - claims.issuedAt > HANDOFF_MAX_LIFETIME_SECONDS) {
    return { ok: false, reason: "handoff lifetime exceeds 120s" };
  }
  if (claims.issuedAt - skew > nowSeconds) {
    return { ok: false, reason: "issuedAt is in the future" };
  }
  if (nowSeconds - skew > claims.expiresAt) {
    return { ok: false, reason: "handoff token expired" };
  }
  return { ok: true, claims };
}

// ---------------------------------------------------------------------------
// Deep-link resolution (contract §2)
// ---------------------------------------------------------------------------

/**
 * Resolve the post-handoff destination to a safe, same-site path under the
 * org's learning tree. Unknown, off-tree, or unsafe targets fall back to the
 * learning home — never an error page exposing internal detail.
 */
export function resolveHandoffPath(
  orgSlug: string,
  rawPath: string | null | undefined,
): string {
  const home = `/${orgSlug}/learn`;
  if (!rawPath) return home;
  // Same-site absolute paths only — reject protocol-relative, absolute URLs,
  // and traversal.
  if (!rawPath.startsWith("/")) return home;
  if (rawPath.startsWith("//")) return home;
  if (rawPath.includes("..")) return home;
  if (rawPath.includes("\\")) return home;
  // Must stay within this org's learning tree.
  if (rawPath !== home && !rawPath.startsWith(`${home}/`)) return home;
  return rawPath;
}

// ---------------------------------------------------------------------------
// Outbound webhook projection (contract §5)
// ---------------------------------------------------------------------------

export type BfhWebhookType = BfhWebhook["type"];

/**
 * Which internal analytics events project to which outbound contract type.
 * Only these cross the boundary; everything else stays internal.
 */
export const INTERNAL_TO_BFH_WEBHOOK_TYPE = {
  "learning.course.completed": "learning.completion",
  "learning.path.completed": "learning.completion",
  "assessment.attempt.passed": "assessment.result",
  "assessment.attempt.failed": "assessment.result",
  "credential.certificate.issued": "credential.issued",
} as const satisfies Partial<Record<EventType, BfhWebhookType>>;

export type ProjectableEventType = keyof typeof INTERNAL_TO_BFH_WEBHOOK_TYPE;

export function isProjectableEventType(
  type: EventType | string,
): type is ProjectableEventType {
  return type in INTERNAL_TO_BFH_WEBHOOK_TYPE;
}

interface WebhookIdentity {
  /** The analytics event id — BFH's dedupe key (at-least-once delivery). */
  eventId: string;
  occurredAt: string;
  organizationSlug: string;
  externalUserId: string;
}

export function buildCompletionWebhook(
  identity: WebhookIdentity,
  target:
    | { kind: "course"; courseSlug: string; courseVersionNumber: number }
    | { kind: "learning_path"; pathSlug: string },
): CompletionWebhook {
  return completionWebhookSchema.parse({
    v: BFH_CONTRACT_VERSION,
    type: "learning.completion",
    ...identity,
    target,
  });
}

export function buildAssessmentResultWebhook(
  identity: WebhookIdentity,
  result: {
    assessmentSlug: string;
    assessmentVersionNumber: number;
    attemptNumber: number;
    outcome: "passed" | "failed";
    scorePercent: number;
  },
): AssessmentResultWebhook {
  return assessmentResultWebhookSchema.parse({
    v: BFH_CONTRACT_VERSION,
    type: "assessment.result",
    ...identity,
    ...result,
  });
}

export function buildCredentialIssuedWebhook(
  identity: WebhookIdentity,
  credential: {
    credentialTitle: string;
    verificationCode: string;
    issuedAt: string;
    expiresAt: string | null;
  },
): CredentialIssuedWebhook {
  return credentialIssuedWebhookSchema.parse({
    v: BFH_CONTRACT_VERSION,
    type: "credential.issued",
    ...identity,
    ...credential,
  });
}
