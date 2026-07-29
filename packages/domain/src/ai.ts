import { z } from "zod";
import { contentBlockSchema } from "./content-blocks";

/**
 * NovaKore AI authoring domain (Phase 2, ADR-010 realized for authoring).
 *
 * - Logical model profiles decouple operations from providers.
 * - Money is INTEGER MINOR UNITS (cents) end to end — never floats.
 * - Every operation's output validates through a registered Zod schema;
 *   invalid output fails safely and is never inserted.
 * - Budget math is pure and testable; enforcement lives in the ledger RPC.
 * - Generated content is ALWAYS draft: nothing in this module (or its
 *   consumers) can publish, grant, issue, or touch learner progress.
 */

export const AI_ENVELOPE_VERSION = 1 as const;

// ---------------------------------------------------------------------------
// Model profiles (logical → provider-specific mapping lives in the adapter)
// ---------------------------------------------------------------------------

export const MODEL_PROFILES = ["drafting", "structured", "rewrite"] as const;
export type ModelProfile = (typeof MODEL_PROFILES)[number];

/**
 * Cost table in CENTS PER MILLION TOKENS, keyed by profile. These are
 * development ESTIMATES for budget enforcement — authoritative cost is
 * provider-invoice reconciliation (documented; not implemented in dev).
 */
export const PROFILE_COST_CENTS_PER_MTOK: Record<
  ModelProfile,
  { input: number; output: number }
> = {
  drafting: { input: 300, output: 1_500 },
  structured: { input: 300, output: 1_500 },
  rewrite: { input: 80, output: 400 },
};

/** Ceiling-divide so estimates never round to free. */
export function estimateCostCents(
  profile: ModelProfile,
  inputTokens: number,
  outputTokens: number,
): number {
  const rate = PROFILE_COST_CENTS_PER_MTOK[profile];
  const inputCents = Math.ceil((inputTokens * rate.input) / 1_000_000);
  const outputCents = Math.ceil((outputTokens * rate.output) / 1_000_000);
  return Math.max(1, inputCents + outputCents);
}

/** Conservative pre-request reservation for a typical generation. */
export function reservationCents(profile: ModelProfile): number {
  // assume up to 8k in / 4k out for drafting+structured, 4k/2k for rewrite
  return profile === "rewrite"
    ? estimateCostCents(profile, 4_000, 2_000)
    : estimateCostCents(profile, 8_000, 4_000);
}

// ---------------------------------------------------------------------------
// Budgets (integer cents, calendar-month window, platform-capped)
// ---------------------------------------------------------------------------

/** Owner-approved development platform cap: $50 / calendar month. */
export const PLATFORM_AI_BUDGET_CENTS = 5_000;

export function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export type BudgetDecision =
  | { allowed: true; remainingCents: number }
  | { allowed: false; reason: string; remainingCents: number };

/** Pure budget check: committed + reserved + the new reservation ≤ limit. */
export function checkBudget(input: {
  limitCents: number;
  committedCents: number;
  reservedCents: number;
  requestCents: number;
}): BudgetDecision {
  const limit = Math.min(input.limitCents, PLATFORM_AI_BUDGET_CENTS);
  const used = input.committedCents + input.reservedCents;
  const remaining = Math.max(0, limit - used);
  if (input.requestCents > remaining) {
    return {
      allowed: false,
      reason: `This request needs about $${(input.requestCents / 100).toFixed(2)} but only $${(remaining / 100).toFixed(2)} of the monthly AI budget remains.`,
      remainingCents: remaining,
    };
  }
  return { allowed: true, remainingCents: remaining - input.requestCents };
}

// ---------------------------------------------------------------------------
// Operations + structured output schemas (the no-dumping-ground rule)
// ---------------------------------------------------------------------------

export const AI_OPERATIONS = [
  "path_outline",
  "course_outline",
  "module_suggestions",
  "lesson_draft",
  "rewrite_audience",
  "rewrite_reading_level",
  "summarize_source",
  "knowledge_checks",
  "assessment_questions",
  "scenario",
  "prerequisite_suggestions",
  "gap_analysis",
  "reflection_prompts",
  "flashcards",
  "source_to_blocks",
] as const;
export type AiOperation = (typeof AI_OPERATIONS)[number];

const title = z.string().min(1).max(200);
const summary = z.string().min(1).max(1_000);

export const pathOutlineSchema = z.strictObject({
  title,
  description: summary,
  courses: z
    .array(z.strictObject({ title, summary, rationale: summary.optional() }))
    .min(1)
    .max(12),
  suggestedPrerequisites: z
    .array(
      z.strictObject({
        courseTitle: title,
        requiresCourseTitle: title,
        reason: summary,
      }),
    )
    .max(20)
    .default([]),
});

export const courseOutlineSchema = z.strictObject({
  title,
  summary,
  modules: z
    .array(
      z.strictObject({
        title,
        lessons: z
          .array(z.strictObject({ title, objective: summary }))
          .min(1)
          .max(12),
      }),
    )
    .min(1)
    .max(10),
});

export const moduleSuggestionsSchema = z.strictObject({
  modules: z
    .array(z.strictObject({ title, rationale: summary }))
    .min(1)
    .max(10),
});

/** Lesson drafts arrive as REAL validated blocks — nothing else inserts. */
export const lessonDraftSchema = z.strictObject({
  title,
  blocks: z.array(contentBlockSchema).min(1).max(30),
});

export const rewriteSchema = z.strictObject({
  text: z.string().min(1).max(20_000),
  notes: summary.optional(),
});

export const sourceSummarySchema = z.strictObject({
  summary: z.string().min(1).max(5_000),
  keyPoints: z.array(z.string().min(1).max(300)).min(1).max(15),
});

export const knowledgeChecksSchema = z.strictObject({
  checks: z
    .array(
      z.strictObject({
        prompt: z.string().min(1).max(1_000),
        options: z.array(z.string().min(1).max(300)).min(2).max(5),
        correctIndex: z.number().int().min(0),
        explanation: z.string().min(1).max(1_000).optional(),
      }),
    )
    .min(1)
    .max(10),
});

export const assessmentQuestionsSchema = knowledgeChecksSchema;

export const scenarioDraftSchema = z.strictObject({
  intro: z.string().min(1).max(2_000),
  steps: z
    .array(
      z.strictObject({
        situation: z.string().min(1).max(2_000),
        consideration: z.string().min(1).max(1_000).optional(),
      }),
    )
    .min(1)
    .max(10),
  debrief: z.string().min(1).max(2_000).optional(),
});

export const prerequisiteSuggestionsSchema = z.strictObject({
  suggestions: z
    .array(
      z.strictObject({
        nodeTitle: title,
        requiresNodeTitle: title,
        reason: summary,
      }),
    )
    .max(20),
});

export const gapAnalysisSchema = z.strictObject({
  gaps: z
    .array(z.strictObject({ area: title, detail: summary }))
    .min(1)
    .max(15),
});

export const reflectionPromptsSchema = z.strictObject({
  prompts: z
    .array(
      z.strictObject({
        prompt: z.string().min(1).max(1_000),
        guidance: summary.optional(),
      }),
    )
    .min(1)
    .max(10),
});

export const flashcardDraftSchema = z.strictObject({
  cards: z
    .array(
      z.strictObject({
        front: z.string().min(1).max(500),
        back: z.string().min(1).max(2_000),
      }),
    )
    .min(1)
    .max(30),
});

export const sourceToBlocksSchema = lessonDraftSchema;

export const AI_OUTPUT_SCHEMAS: Record<AiOperation, z.ZodType> = {
  path_outline: pathOutlineSchema,
  course_outline: courseOutlineSchema,
  module_suggestions: moduleSuggestionsSchema,
  lesson_draft: lessonDraftSchema,
  rewrite_audience: rewriteSchema,
  rewrite_reading_level: rewriteSchema,
  summarize_source: sourceSummarySchema,
  knowledge_checks: knowledgeChecksSchema,
  assessment_questions: assessmentQuestionsSchema,
  scenario: scenarioDraftSchema,
  prerequisite_suggestions: prerequisiteSuggestionsSchema,
  gap_analysis: gapAnalysisSchema,
  reflection_prompts: reflectionPromptsSchema,
  flashcards: flashcardDraftSchema,
  source_to_blocks: sourceToBlocksSchema,
};

export function validateAiOutput(
  operation: AiOperation,
  output: unknown,
): { ok: true; output: unknown } | { ok: false; error: string } {
  const parsed = AI_OUTPUT_SCHEMAS[operation].safeParse(output);
  return parsed.success
    ? { ok: true, output: parsed.data }
    : {
        ok: false,
        error: parsed.error.issues[0]
          ? `${parsed.error.issues[0].path.join(".")}: ${parsed.error.issues[0].message}`
          : "invalid output",
      };
}

// ---------------------------------------------------------------------------
// Generation request/result contracts (provider adapters implement these)
// ---------------------------------------------------------------------------

export const generationRequestSchema = z.strictObject({
  operation: z.enum(AI_OPERATIONS),
  profile: z.enum(MODEL_PROFILES),
  objective: z.string().min(1).max(2_000),
  audience: z.string().min(1).max(300).optional(),
  readingLevel: z.enum(["introductory", "intermediate", "advanced"]).optional(),
  /** Tenant-owned source excerpts — the ONLY content sent to a provider. */
  sources: z
    .array(
      z.strictObject({
        sourceDocumentId: z.uuid(),
        title,
        excerpt: z.string().min(1).max(20_000),
      }),
    )
    .max(5)
    .default([]),
  /** Text to transform (rewrite/summarize operations). */
  inputText: z.string().max(20_000).optional(),
});
export type GenerationRequest = z.infer<typeof generationRequestSchema>;

export interface GenerationUsage {
  inputTokens: number;
  outputTokens: number;
}

export type ProviderResult =
  | { ok: true; output: unknown; usage: GenerationUsage; providerModel: string }
  | { ok: false; error: NormalizedProviderError };

export interface AiProvider {
  readonly name: string;
  generate(
    request: GenerationRequest,
    signal?: AbortSignal,
  ): Promise<ProviderResult>;
}

// ---------------------------------------------------------------------------
// Provider error normalization
// ---------------------------------------------------------------------------

export const PROVIDER_ERROR_KINDS = [
  "rate_limited",
  "timeout",
  "invalid_request",
  "auth",
  "overloaded",
  "content_refused",
  "invalid_output",
  "cancelled",
  "unknown",
] as const;
export type ProviderErrorKind = (typeof PROVIDER_ERROR_KINDS)[number];

export interface NormalizedProviderError {
  kind: ProviderErrorKind;
  /** Safe, non-sensitive message for storage and display. */
  message: string;
  retryable: boolean;
}

export function normalizeProviderError(input: {
  status?: number;
  code?: string;
  message?: string;
}): NormalizedProviderError {
  const message = (input.message ?? "Provider request failed").slice(0, 300);
  if (input.code === "aborted" || input.code === "cancelled") {
    return {
      kind: "cancelled",
      message: "The request was cancelled.",
      retryable: false,
    };
  }
  if (input.code === "timeout" || input.status === 408) {
    return {
      kind: "timeout",
      message: "The provider timed out.",
      retryable: true,
    };
  }
  switch (input.status) {
    case 401:
    case 403:
      return {
        kind: "auth",
        message: "Provider authentication failed.",
        retryable: false,
      };
    case 400:
    case 422:
      return { kind: "invalid_request", message, retryable: false };
    case 429:
      return {
        kind: "rate_limited",
        message: "The provider rate limit was reached.",
        retryable: true,
      };
    case 500:
    case 502:
    case 503:
    case 529:
      return {
        kind: "overloaded",
        message: "The provider is overloaded.",
        retryable: true,
      };
    default:
      return { kind: "unknown", message, retryable: false };
  }
}

// ---------------------------------------------------------------------------
// Generation lifecycle
// ---------------------------------------------------------------------------

export const GENERATION_STATUSES = [
  "reserved", // budget reservation placed, request in flight
  "completed", // validated output stored, cost reconciled
  "failed", // provider or validation failure, reservation released
  "accepted", // author inserted the output into a draft
  "rejected", // author discarded the output
] as const;
export type GenerationStatus = (typeof GENERATION_STATUSES)[number];

const GENERATION_TRANSITIONS: Record<
  GenerationStatus,
  readonly GenerationStatus[]
> = {
  reserved: ["completed", "failed"],
  completed: ["accepted", "rejected"],
  failed: [],
  accepted: [],
  rejected: [],
};

export function canTransitionGeneration(
  from: GenerationStatus,
  to: GenerationStatus,
): boolean {
  return GENERATION_TRANSITIONS[from].includes(to);
}
