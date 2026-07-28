import { z } from "zod";

/**
 * NovaKore assessment domain (Phase 1D).
 *
 * - Versioned, schema-validated item types (ADR-008 applied to assessments).
 * - Deterministic, server-authoritative objective grading — these pure
 *   functions are the single scoring implementation, invoked by the
 *   database RPC layer's application mirror and by tests. Correct-answer
 *   configuration never leaves the trusted side.
 * - Attempt and review state machines (smallest coherent sets).
 * - Bounded settings (passing threshold, time limit, retake policy).
 * - Constrained certificate template schema (no free-form design canvas).
 */

export const ASSESSMENT_SCHEMA_VERSION = 1 as const;

// ---------------------------------------------------------------------------
// Shared safe-text bounds (same contract as content blocks: plain text with
// the minimal inline subset, escape-first rendering, never raw HTML)
// ---------------------------------------------------------------------------

const promptText = z.string().min(1).max(5_000);
const instructionText = z.string().min(1).max(5_000);
const feedbackText = z.string().min(1).max(2_000);

const points = z.number().int().min(0).max(1_000);

// ---------------------------------------------------------------------------
// Item types (Phase 1D reliable subset)
// ---------------------------------------------------------------------------

export const ASSESSMENT_ITEM_TYPES = [
  "multiple_choice",
  "multiple_select",
  "true_false",
  "short_answer",
  "long_answer",
  "file_submission",
] as const;
export type AssessmentItemType = (typeof ASSESSMENT_ITEM_TYPES)[number];

/** Item types graded deterministically by the platform. */
export const OBJECTIVE_ITEM_TYPES = [
  "multiple_choice",
  "multiple_select",
  "true_false",
] as const satisfies readonly AssessmentItemType[];

/** Item types routed to manual review. */
export const SUBJECTIVE_ITEM_TYPES = [
  "short_answer",
  "long_answer",
  "file_submission",
] as const satisfies readonly AssessmentItemType[];

export function isObjectiveType(type: AssessmentItemType): boolean {
  return (OBJECTIVE_ITEM_TYPES as readonly string[]).includes(type);
}

const itemBase = z.object({
  /** Stable identity across drafts and versions. */
  id: z.uuid(),
  /** Fractional-index position (ADR-014). */
  position: z.string().min(1),
  required: z.boolean().default(true),
});

const optionSchema = z.strictObject({
  id: z.uuid(),
  text: z.string().min(1).max(500),
});

export const multipleChoiceDataV1 = z
  .strictObject({
    prompt: promptText,
    instructions: instructionText.optional(),
    options: z.array(optionSchema).min(2).max(10),
    /** Never sent to the learner client. */
    correctOptionId: z.uuid(),
    points,
    feedback: z
      .strictObject({
        correct: feedbackText.optional(),
        incorrect: feedbackText.optional(),
      })
      .optional(),
  })
  .refine((d) => d.options.some((o) => o.id === d.correctOptionId), {
    message: "correctOptionId must reference one of the options",
  })
  .refine(
    (d) => new Set(d.options.map((o) => o.id)).size === d.options.length,
    {
      message: "option ids must be unique",
    },
  );

export const multipleSelectDataV1 = z
  .strictObject({
    prompt: promptText,
    instructions: instructionText.optional(),
    options: z.array(optionSchema).min(2).max(10),
    /** Never sent to the learner client. */
    correctOptionIds: z.array(z.uuid()).min(1),
    /**
     * Partial credit is opt-in and documented:
     * points × max(0, (correct selections − incorrect selections) / total correct).
     */
    partialCredit: z.boolean().default(false),
    points,
    feedback: z
      .strictObject({
        correct: feedbackText.optional(),
        incorrect: feedbackText.optional(),
      })
      .optional(),
  })
  .refine(
    (d) => d.correctOptionIds.every((id) => d.options.some((o) => o.id === id)),
    { message: "every correctOptionId must reference an option" },
  )
  .refine(
    (d) => new Set(d.options.map((o) => o.id)).size === d.options.length,
    {
      message: "option ids must be unique",
    },
  )
  .refine(
    (d) => new Set(d.correctOptionIds).size === d.correctOptionIds.length,
    { message: "correctOptionIds must be unique" },
  );

export const trueFalseDataV1 = z.strictObject({
  prompt: promptText,
  instructions: instructionText.optional(),
  /** Never sent to the learner client. */
  correctValue: z.boolean(),
  points,
  feedback: z
    .strictObject({
      correct: feedbackText.optional(),
      incorrect: feedbackText.optional(),
    })
    .optional(),
});

export const shortAnswerDataV1 = z.strictObject({
  prompt: promptText,
  instructions: instructionText.optional(),
  maxLength: z.number().int().min(1).max(2_000).default(500),
  points,
  /** Reviewer-facing scoring guidance (never shown to learners). */
  rubric: z.string().min(1).max(5_000).optional(),
});

export const longAnswerDataV1 = z.strictObject({
  prompt: promptText,
  instructions: instructionText.optional(),
  maxLength: z.number().int().min(1).max(20_000).default(5_000),
  points,
  rubric: z.string().min(1).max(5_000).optional(),
});

/**
 * File submission: the item type is fully modeled; binary upload is a
 * guarded deferral in Phase 1D (no submissions bucket yet). The learner
 * records a plain-text submission note; the reviewer collects the file
 * out of band. Documented in attempt-and-grading.md — never faked.
 */
export const fileSubmissionDataV1 = z.strictObject({
  prompt: promptText,
  instructions: instructionText.optional(),
  /** Allowlist for the future upload path (media architecture, ADR-015). */
  allowedMimeTypes: z
    .array(z.enum(["application/pdf", "image/png", "image/jpeg", "text/plain"]))
    .min(1)
    .default(["application/pdf"]),
  maxBytes: z.number().int().min(1).max(50_000_000).default(10_000_000),
  points,
  rubric: z.string().min(1).max(5_000).optional(),
});

export const assessmentItemSchema = z.discriminatedUnion("type", [
  itemBase.extend({
    type: z.literal("multiple_choice"),
    schemaVersion: z.literal(1),
    data: multipleChoiceDataV1,
  }),
  itemBase.extend({
    type: z.literal("multiple_select"),
    schemaVersion: z.literal(1),
    data: multipleSelectDataV1,
  }),
  itemBase.extend({
    type: z.literal("true_false"),
    schemaVersion: z.literal(1),
    data: trueFalseDataV1,
  }),
  itemBase.extend({
    type: z.literal("short_answer"),
    schemaVersion: z.literal(1),
    data: shortAnswerDataV1,
  }),
  itemBase.extend({
    type: z.literal("long_answer"),
    schemaVersion: z.literal(1),
    data: longAnswerDataV1,
  }),
  itemBase.extend({
    type: z.literal("file_submission"),
    schemaVersion: z.literal(1),
    data: fileSubmissionDataV1,
  }),
]);
export type AssessmentItem = z.infer<typeof assessmentItemSchema>;

/** Frozen item array inside assessment_versions.items. */
export const assessmentItemsSnapshotSchema = z
  .array(assessmentItemSchema)
  .min(1)
  .max(100);

export const CURRENT_ITEM_SCHEMA_VERSION: Record<AssessmentItemType, number> = {
  multiple_choice: 1,
  multiple_select: 1,
  true_false: 1,
  short_answer: 1,
  long_answer: 1,
  file_submission: 1,
};

/**
 * Item schema migrations (stepwise, pure, registered per upgrade — same
 * contract as content blocks). Empty at v1; publication rejects unknown
 * (type, schemaVersion) pairs rather than guessing.
 */
const itemMigrations: Partial<
  Record<`${AssessmentItemType}:${number}`, (data: unknown) => unknown>
> = {};

export function migrateAssessmentItemData(
  type: AssessmentItemType,
  fromVersion: number,
  data: unknown,
): { schemaVersion: number; data: unknown } {
  let version = fromVersion;
  let current = data;
  const target = CURRENT_ITEM_SCHEMA_VERSION[type];
  while (version < target) {
    const step = itemMigrations[`${type}:${version}`];
    if (!step) {
      throw new Error(
        `missing item migration ${type}:${version} → ${version + 1}`,
      );
    }
    current = step(current);
    version += 1;
  }
  return { schemaVersion: version, data: current };
}

// ---------------------------------------------------------------------------
// Learner-safe item view (correct-answer configuration stripped)
// ---------------------------------------------------------------------------

export interface LearnerItemView {
  id: string;
  type: AssessmentItemType;
  position: string;
  required: boolean;
  prompt: string;
  instructions?: string;
  points: number;
  options?: { id: string; text: string }[];
  maxLength?: number;
  /** file_submission only — upload is a guarded deferral in Phase 1D. */
  uploadDeferred?: boolean;
}

/**
 * The ONLY shape assessment items may take on their way to a learner.
 * Strips correctOptionId(s), correctValue, feedback, and rubric fields.
 */
export function toLearnerItemView(item: AssessmentItem): LearnerItemView {
  const base = {
    id: item.id,
    type: item.type,
    position: item.position,
    required: item.required,
    prompt: item.data.prompt,
    points: item.data.points,
    ...(item.data.instructions !== undefined
      ? { instructions: item.data.instructions }
      : {}),
  };
  switch (item.type) {
    case "multiple_choice":
    case "multiple_select":
      return {
        ...base,
        options: item.data.options.map((o) => ({ id: o.id, text: o.text })),
      };
    case "true_false":
      return base;
    case "short_answer":
    case "long_answer":
      return { ...base, maxLength: item.data.maxLength };
    case "file_submission":
      return { ...base, uploadDeferred: true };
  }
}

// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------

export const responseSchemas = {
  multiple_choice: z.strictObject({ optionId: z.uuid() }),
  multiple_select: z.strictObject({ optionIds: z.array(z.uuid()).min(1) }),
  true_false: z.strictObject({ value: z.boolean() }),
  short_answer: z.strictObject({ text: z.string().min(1) }),
  long_answer: z.strictObject({ text: z.string().min(1) }),
  /** Guarded deferral: a plain-text note, never a fake upload. */
  file_submission: z.strictObject({ note: z.string().min(1).max(2_000) }),
} satisfies Record<AssessmentItemType, z.ZodType>;

export function validateResponse(
  item: AssessmentItem,
  response: unknown,
): { ok: true; response: unknown } | { ok: false; error: string } {
  const parsed = responseSchemas[item.type].safeParse(response);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "invalid response",
    };
  }
  // Type-specific bounds beyond shape
  if (
    (item.type === "short_answer" || item.type === "long_answer") &&
    (parsed.data as { text: string }).text.length > item.data.maxLength
  ) {
    return {
      ok: false,
      error: `response exceeds ${item.data.maxLength} characters`,
    };
  }
  if (item.type === "multiple_choice") {
    const { optionId } = parsed.data as { optionId: string };
    if (!item.data.options.some((o) => o.id === optionId)) {
      return { ok: false, error: "optionId is not one of the item's options" };
    }
  }
  if (item.type === "multiple_select") {
    const { optionIds } = parsed.data as { optionIds: string[] };
    if (new Set(optionIds).size !== optionIds.length) {
      return { ok: false, error: "optionIds must be unique" };
    }
    if (!optionIds.every((id) => item.data.options.some((o) => o.id === id))) {
      return {
        ok: false,
        error: "every optionId must be one of the item's options",
      };
    }
  }
  return { ok: true, response: parsed.data };
}

// ---------------------------------------------------------------------------
// Deterministic objective grading
// ---------------------------------------------------------------------------

export interface ItemGrade {
  pointsEarned: number;
  pointsPossible: number;
  /** null for subjective items awaiting review. */
  correct: boolean | null;
  needsReview: boolean;
}

/**
 * Grade one response. Pure and deterministic: identical inputs always
 * produce identical grades. Subjective items return needsReview with zero
 * provisional points (reviewer assigns).
 */
export function gradeResponse(
  item: AssessmentItem,
  response: unknown,
): ItemGrade {
  const max = item.data.points;
  const checked = validateResponse(item, response);
  if (!checked.ok) {
    // An invalid stored response can only score zero; objective items are
    // conclusively wrong, subjective ones still go to review.
    return isObjectiveType(item.type)
      ? {
          pointsEarned: 0,
          pointsPossible: max,
          correct: false,
          needsReview: false,
        }
      : {
          pointsEarned: 0,
          pointsPossible: max,
          correct: null,
          needsReview: true,
        };
  }
  switch (item.type) {
    case "multiple_choice": {
      const r = checked.response as { optionId: string };
      const correct = r.optionId === item.data.correctOptionId;
      return {
        pointsEarned: correct ? max : 0,
        pointsPossible: max,
        correct,
        needsReview: false,
      };
    }
    case "true_false": {
      const r = checked.response as { value: boolean };
      const correct = r.value === item.data.correctValue;
      return {
        pointsEarned: correct ? max : 0,
        pointsPossible: max,
        correct,
        needsReview: false,
      };
    }
    case "multiple_select": {
      const r = checked.response as { optionIds: string[] };
      const correctSet = new Set(item.data.correctOptionIds);
      const chosenCorrect = r.optionIds.filter((id) =>
        correctSet.has(id),
      ).length;
      const chosenIncorrect = r.optionIds.length - chosenCorrect;
      const exact = chosenIncorrect === 0 && chosenCorrect === correctSet.size;
      if (!item.data.partialCredit) {
        return {
          pointsEarned: exact ? max : 0,
          pointsPossible: max,
          correct: exact,
          needsReview: false,
        };
      }
      const ratio = Math.max(
        0,
        (chosenCorrect - chosenIncorrect) / correctSet.size,
      );
      // Round to 2dp for stable storage; full marks only when exact.
      const earned = Math.round(max * ratio * 100) / 100;
      return {
        pointsEarned: exact ? max : Math.min(earned, max),
        pointsPossible: max,
        correct: exact,
        needsReview: false,
      };
    }
    case "short_answer":
    case "long_answer":
    case "file_submission":
      return {
        pointsEarned: 0,
        pointsPossible: max,
        correct: null,
        needsReview: true,
      };
  }
}

export interface AttemptOutcome {
  pointsEarned: number;
  pointsPossible: number;
  percent: number;
  needsReview: boolean;
  /** null while review is pending. */
  passed: boolean | null;
}

/**
 * Aggregate an attempt. Items without a stored response grade as
 * unanswered (objective: zero; subjective REQUIRED: review; subjective
 * optional unanswered: zero, no review). Passing compares the percentage
 * against the version's snapshot threshold; while any review is pending
 * the outcome stays open.
 */
export function computeAttemptOutcome(input: {
  items: AssessmentItem[];
  responses: Map<string, unknown>;
  passingPercent: number;
  /** Reviewer-assigned points per subjective item id (after review). */
  reviewScores?: Map<string, number>;
}): AttemptOutcome {
  let earned = 0;
  let possible = 0;
  let needsReview = false;
  for (const item of input.items) {
    const response = input.responses.get(item.id);
    const reviewed = input.reviewScores?.get(item.id);
    possible += item.data.points;
    if (reviewed !== undefined) {
      earned += Math.min(Math.max(reviewed, 0), item.data.points);
      continue;
    }
    if (response === undefined) {
      if (!isObjectiveType(item.type) && item.required) needsReview = true;
      continue;
    }
    const grade = gradeResponse(item, response);
    earned += grade.pointsEarned;
    if (grade.needsReview) needsReview = true;
  }
  const percent =
    possible === 0 ? 0 : Math.round((earned / possible) * 10_000) / 100;
  return {
    pointsEarned: Math.round(earned * 100) / 100,
    pointsPossible: possible,
    percent,
    needsReview,
    passed: needsReview ? null : percent >= input.passingPercent,
  };
}

// ---------------------------------------------------------------------------
// Assessment settings (frozen into each published version)
// ---------------------------------------------------------------------------

export const assessmentSettingsSchema = z.strictObject({
  schemaVersion: z.literal(1),
  /** Percentage 1–100 required to pass. Documented default: 70. */
  passingPercent: z.number().int().min(1).max(100).default(70),
  /** Absent = untimed. Server-computed expiration; client display only. */
  timeLimitMinutes: z.number().int().min(1).max(600).optional(),
  /** Absent = unlimited retakes (documented conservative default). */
  maxAttempts: z.number().int().min(1).max(100).optional(),
  /** Minutes between a finalized attempt and the next start. Default 0. */
  cooldownMinutes: z.number().int().min(0).max(10_080).default(0),
  /** Which attempt counts toward passing/records. Default: highest. */
  scorePolicy: z
    .enum(["highest", "latest", "first_passing"])
    .default("highest"),
});
export type AssessmentSettings = z.infer<typeof assessmentSettingsSchema>;

export const DEFAULT_ASSESSMENT_SETTINGS: AssessmentSettings =
  assessmentSettingsSchema.parse({ schemaVersion: 1 });

// ---------------------------------------------------------------------------
// Attempt state machine (single authoritative status model)
// ---------------------------------------------------------------------------

export const ATTEMPT_STATUSES = [
  "started",
  "submitted",
  "pending_review",
  "passed",
  "failed",
  "abandoned",
  "expired",
] as const;
export type AttemptStatus = (typeof ATTEMPT_STATUSES)[number];

const ATTEMPT_TRANSITIONS: Record<AttemptStatus, readonly AttemptStatus[]> = {
  started: ["submitted", "abandoned", "expired"],
  // "submitted" is transient inside finalization: grading resolves it to
  // pending_review / passed / failed within the same transaction.
  submitted: ["pending_review", "passed", "failed"],
  pending_review: ["passed", "failed"],
  passed: [],
  failed: [],
  abandoned: [],
  expired: [],
};

export function canTransitionAttempt(
  from: AttemptStatus,
  to: AttemptStatus,
): boolean {
  return ATTEMPT_TRANSITIONS[from].includes(to);
}

export const FINAL_ATTEMPT_STATUSES: readonly AttemptStatus[] = [
  "passed",
  "failed",
  "abandoned",
  "expired",
];

// ---------------------------------------------------------------------------
// Review state machine (smallest coherent set)
// ---------------------------------------------------------------------------

export const REVIEW_STATUSES = [
  "pending_review",
  "in_review",
  "completed",
] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

const REVIEW_TRANSITIONS: Record<ReviewStatus, readonly ReviewStatus[]> = {
  pending_review: ["in_review", "completed"],
  in_review: ["completed", "pending_review"], // release a claim
  completed: [],
};

export function canTransitionReview(
  from: ReviewStatus,
  to: ReviewStatus,
): boolean {
  return REVIEW_TRANSITIONS[from].includes(to);
}

// ---------------------------------------------------------------------------
// Retake eligibility
// ---------------------------------------------------------------------------

export type RetakeDecision =
  { allowed: true } | { allowed: false; reason: string };

export function computeRetakeEligibility(input: {
  settings: Pick<AssessmentSettings, "maxAttempts" | "cooldownMinutes">;
  priorAttempts: {
    status: AttemptStatus;
    finalizedAt: string | null;
  }[];
  now: Date;
}): RetakeDecision {
  const open = input.priorAttempts.find(
    (a) => a.status === "started" || a.status === "submitted",
  );
  if (open) {
    return { allowed: false, reason: "An attempt is already in progress." };
  }
  if (input.priorAttempts.some((a) => a.status === "pending_review")) {
    return {
      allowed: false,
      reason: "Your previous attempt is awaiting review.",
    };
  }
  if (input.priorAttempts.some((a) => a.status === "passed")) {
    return {
      allowed: false,
      reason: "You have already passed this assessment.",
    };
  }
  const counted = input.priorAttempts.filter(
    (a) => a.status !== "abandoned",
  ).length;
  if (
    input.settings.maxAttempts !== undefined &&
    counted >= input.settings.maxAttempts
  ) {
    return {
      allowed: false,
      reason: `The attempt limit (${input.settings.maxAttempts}) has been reached.`,
    };
  }
  if (input.settings.cooldownMinutes > 0) {
    const latest = input.priorAttempts
      .map((a) => (a.finalizedAt ? Date.parse(a.finalizedAt) : null))
      .filter((t): t is number => t !== null)
      .sort((a, b) => b - a)[0];
    if (latest !== undefined) {
      const readyAt = latest + input.settings.cooldownMinutes * 60_000;
      if (input.now.getTime() < readyAt) {
        return {
          allowed: false,
          reason: `Retake available after the cooldown (${input.settings.cooldownMinutes} min).`,
        };
      }
    }
  }
  return { allowed: true };
}

// ---------------------------------------------------------------------------
// Certificate template (constrained schema — no design canvas)
// ---------------------------------------------------------------------------

const safeLine = z.string().min(1).max(200);

export const certificateTemplateSchema = z.strictObject({
  schemaVersion: z.literal(1),
  /** Certificate headline, e.g. "Certificate of Completion". */
  title: safeLine,
  subtitle: safeLine.optional(),
  /** Body copy around the recipient name; plain text only. */
  bodyText: z.string().min(1).max(1_000).optional(),
  signatories: z
    .array(z.strictObject({ name: safeLine, role: safeLine }))
    .max(3)
    .default([]),
  /** Renders through org theme tokens; no raw CSS or colors here. */
  showVerification: z.boolean().default(true),
  /** Months until expiration; absent = never expires. */
  expirationMonths: z.number().int().min(1).max(120).optional(),
});
export type CertificateTemplate = z.infer<typeof certificateTemplateSchema>;

export const CREDENTIAL_STATUSES = ["active", "expired", "revoked"] as const;
export type CredentialStatus = (typeof CREDENTIAL_STATUSES)[number];

/**
 * Lazy expiration: expiration is a stored timestamp evaluated on read
 * (no background worker in Phase 1D — documented).
 */
export function effectiveCredentialStatus(input: {
  status: CredentialStatus;
  expiresAt: string | null;
  now: Date;
}): CredentialStatus {
  if (input.status === "revoked") return "revoked";
  if (input.expiresAt && Date.parse(input.expiresAt) <= input.now.getTime()) {
    return "expired";
  }
  return input.status === "expired" ? "expired" : "active";
}

/**
 * Verification identifiers are random, public-safe, and never the row id:
 * NVK- followed by 16 hex characters in display groups of 4
 * (~64 bits — enumeration-resistant; format checked at the database too).
 */
export const VERIFICATION_CODE_PATTERN =
  /^NVK-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/;
