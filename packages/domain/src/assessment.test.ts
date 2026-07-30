import { describe, expect, test } from "vitest";
import {
  ASSESSMENT_ITEM_TYPES,
  CURRENT_ITEM_SCHEMA_VERSION,
  DEFAULT_ASSESSMENT_SETTINGS,
  VERIFICATION_CODE_PATTERN,
  assessmentItemSchema,
  assessmentItemsSnapshotSchema,
  assessmentSettingsSchema,
  canTransitionAttempt,
  canTransitionReview,
  certificateTemplateSchema,
  computeAttemptOutcome,
  computeRetakeEligibility,
  effectiveCredentialStatus,
  gradeResponse,
  migrateAssessmentItemData,
  toLearnerItemView,
  validateResponse,
  type AssessmentItem,
} from "./assessment";
import {
  bfhWebhookSchema,
  enrollmentRequestSchema,
  identityHandoffClaimsSchema,
} from "./bfh-contract";
import { EVENT_TYPES, eventEnvelopeSchema } from "./learning";

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const mcItem: AssessmentItem = assessmentItemSchema.parse({
  id: id(1),
  type: "multiple_choice",
  schemaVersion: 1,
  position: "a0",
  required: true,
  data: {
    prompt: "Which principle governs published versions?",
    options: [
      { id: id(11), text: "They are mutable" },
      { id: id(12), text: "They are immutable" },
      { id: id(13), text: "They are deleted on publish" },
    ],
    correctOptionId: id(12),
    points: 10,
  },
});

const msItem: AssessmentItem = assessmentItemSchema.parse({
  id: id(2),
  type: "multiple_select",
  schemaVersion: 1,
  position: "a1",
  required: true,
  data: {
    prompt: "Select every objective item type.",
    options: [
      { id: id(21), text: "multiple_choice" },
      { id: id(22), text: "true_false" },
      { id: id(23), text: "long_answer" },
      { id: id(24), text: "file_submission" },
    ],
    correctOptionIds: [id(21), id(22)],
    partialCredit: true,
    points: 10,
  },
});

const tfItem: AssessmentItem = assessmentItemSchema.parse({
  id: id(3),
  type: "true_false",
  schemaVersion: 1,
  position: "a2",
  required: true,
  data: {
    prompt: "Attempts pin exact versions.",
    correctValue: true,
    points: 5,
  },
});

const essayItem: AssessmentItem = assessmentItemSchema.parse({
  id: id(4),
  type: "long_answer",
  schemaVersion: 1,
  position: "a3",
  required: true,
  data: {
    prompt: "Explain the outbox pattern.",
    maxLength: 2000,
    points: 15,
    rubric: "Full marks for transactional atomicity + idempotency.",
  },
});

describe("assessment item schemas", () => {
  test("every registered type has a current schema version", () => {
    for (const type of ASSESSMENT_ITEM_TYPES) {
      expect(CURRENT_ITEM_SCHEMA_VERSION[type]).toBeGreaterThanOrEqual(1);
    }
  });

  test("correct-answer configuration must reference real options", () => {
    expect(() =>
      assessmentItemSchema.parse({
        ...mcItem,
        data: { ...mcItem.data, correctOptionId: id(99) },
      }),
    ).toThrow(/must reference/);
    expect(() =>
      assessmentItemSchema.parse({
        ...msItem,
        data: {
          ...msItem.data,
          correctOptionIds: [id(21), id(99)],
        },
      }),
    ).toThrow(/must reference an option/);
  });

  test("unknown keys and empty snapshots are rejected", () => {
    expect(() =>
      assessmentItemSchema.parse({
        ...tfItem,
        data: { ...tfItem.data, injected: "<script>" },
      }),
    ).toThrow();
    expect(() => assessmentItemsSnapshotSchema.parse([])).toThrow();
  });

  test("missing migrations fail loudly instead of guessing", () => {
    expect(() => migrateAssessmentItemData("multiple_choice", 0, {})).toThrow(
      /missing item migration/,
    );
    const same = migrateAssessmentItemData("true_false", 1, tfItem.data);
    expect(same.schemaVersion).toBe(1);
  });
});

describe("learner item view", () => {
  test("strips every correct-answer, feedback, and rubric field", () => {
    for (const item of [mcItem, msItem, tfItem, essayItem]) {
      const view = toLearnerItemView(item);
      const json = JSON.stringify(view);
      expect(json).not.toMatch(/correct/i);
      expect(json).not.toMatch(/rubric/i);
      expect(json).not.toMatch(/feedback/i);
    }
  });

  test("keeps what the learner needs", () => {
    const view = toLearnerItemView(mcItem);
    expect(view.options).toHaveLength(3);
    expect(view.prompt).toMatch(/published versions/);
    expect(view.points).toBe(10);
    const fileView = toLearnerItemView(
      assessmentItemSchema.parse({
        id: id(5),
        type: "file_submission",
        schemaVersion: 1,
        position: "a4",
        required: false,
        data: { prompt: "Upload your worksheet.", points: 5 },
      }),
    );
    expect(fileView.uploadDeferred).toBe(true);
  });
});

describe("response validation", () => {
  test("responses must match the item's options and bounds", () => {
    expect(validateResponse(mcItem, { optionId: id(99) }).ok).toBe(false);
    expect(validateResponse(msItem, { optionIds: [id(21), id(21)] }).ok).toBe(
      false,
    );
    expect(validateResponse(essayItem, { text: "x".repeat(2001) }).ok).toBe(
      false,
    );
    expect(
      validateResponse(essayItem, { text: "Atomic + idempotent." }).ok,
    ).toBe(true);
  });
});

describe("deterministic grading", () => {
  test("multiple choice and true/false grade exactly", () => {
    expect(gradeResponse(mcItem, { optionId: id(12) })).toEqual({
      pointsEarned: 10,
      pointsPossible: 10,
      correct: true,
      needsReview: false,
    });
    expect(gradeResponse(mcItem, { optionId: id(11) }).pointsEarned).toBe(0);
    expect(gradeResponse(tfItem, { value: true }).correct).toBe(true);
    expect(gradeResponse(tfItem, { value: false }).pointsEarned).toBe(0);
  });

  test("multiple select: all-or-nothing unless partial credit is enabled", () => {
    const strict = assessmentItemSchema.parse({
      ...msItem,
      data: { ...msItem.data, partialCredit: false },
    });
    expect(gradeResponse(strict, { optionIds: [id(21)] }).pointsEarned).toBe(0);
    expect(
      gradeResponse(strict, { optionIds: [id(21), id(22)] }).pointsEarned,
    ).toBe(10);
  });

  test("multiple select partial credit follows the documented formula", () => {
    // 1 correct chosen, 0 incorrect → (1-0)/2 × 10 = 5
    expect(gradeResponse(msItem, { optionIds: [id(21)] }).pointsEarned).toBe(5);
    // 2 correct + 1 incorrect → (2-1)/2 × 10 = 5, not full marks
    const mixed = gradeResponse(msItem, {
      optionIds: [id(21), id(22), id(23)],
    });
    expect(mixed.pointsEarned).toBe(5);
    expect(mixed.correct).toBe(false);
    // more wrong than right floors at zero
    expect(
      gradeResponse(msItem, { optionIds: [id(23), id(24)] }).pointsEarned,
    ).toBe(0);
  });

  test("grading is deterministic", () => {
    const a = gradeResponse(msItem, { optionIds: [id(21), id(23)] });
    const b = gradeResponse(msItem, { optionIds: [id(21), id(23)] });
    expect(a).toEqual(b);
  });

  test("subjective items route to review with zero provisional points", () => {
    const grade = gradeResponse(essayItem, {
      text: "The outbox commits with state.",
    });
    expect(grade).toEqual({
      pointsEarned: 0,
      pointsPossible: 15,
      correct: null,
      needsReview: true,
    });
  });
});

describe("attempt outcome", () => {
  const items = [mcItem, tfItem, essayItem]; // 10 + 5 + 15 = 30 possible

  test("objective-only pass/fail resolves immediately", () => {
    const outcome = computeAttemptOutcome({
      items: [mcItem, tfItem],
      responses: new Map<string, unknown>([
        [mcItem.id, { optionId: id(12) }],
        [tfItem.id, { value: false }],
      ]),
      passingPercent: 60,
    });
    expect(outcome.pointsEarned).toBe(10);
    expect(outcome.pointsPossible).toBe(15);
    expect(outcome.percent).toBeCloseTo(66.67, 1);
    expect(outcome.passed).toBe(true);
  });

  test("a required subjective item holds the outcome open", () => {
    const outcome = computeAttemptOutcome({
      items,
      responses: new Map<string, unknown>([
        [mcItem.id, { optionId: id(12) }],
        [tfItem.id, { value: true }],
        [essayItem.id, { text: "answer" }],
      ]),
      passingPercent: 70,
    });
    expect(outcome.needsReview).toBe(true);
    expect(outcome.passed).toBeNull();
  });

  test("review scores close the outcome and are clamped to item max", () => {
    const outcome = computeAttemptOutcome({
      items,
      responses: new Map<string, unknown>([
        [mcItem.id, { optionId: id(12) }],
        [tfItem.id, { value: true }],
        [essayItem.id, { text: "answer" }],
      ]),
      passingPercent: 70,
      reviewScores: new Map([[essayItem.id, 99]]),
    });
    expect(outcome.pointsEarned).toBe(30); // essay clamped to 15
    expect(outcome.passed).toBe(true);
  });

  test("unanswered required subjective still requires review; unanswered objective scores zero", () => {
    const outcome = computeAttemptOutcome({
      items,
      responses: new Map(),
      passingPercent: 70,
    });
    expect(outcome.pointsEarned).toBe(0);
    expect(outcome.needsReview).toBe(true);
  });
});

describe("state machines", () => {
  test("attempt transitions form one authoritative model", () => {
    expect(canTransitionAttempt("started", "submitted")).toBe(true);
    expect(canTransitionAttempt("submitted", "pending_review")).toBe(true);
    expect(canTransitionAttempt("pending_review", "passed")).toBe(true);
    expect(canTransitionAttempt("passed", "failed")).toBe(false);
    expect(canTransitionAttempt("failed", "started")).toBe(false);
    expect(canTransitionAttempt("started", "passed")).toBe(false);
  });

  test("review transitions are minimal and final", () => {
    expect(canTransitionReview("pending_review", "in_review")).toBe(true);
    expect(canTransitionReview("in_review", "pending_review")).toBe(true);
    expect(canTransitionReview("in_review", "completed")).toBe(true);
    expect(canTransitionReview("completed", "in_review")).toBe(false);
  });
});

describe("retake eligibility", () => {
  const settings = { maxAttempts: 2, cooldownMinutes: 60 };
  const now = new Date("2026-07-28T12:00:00Z");

  test("open, pending-review, and passed attempts block retakes", () => {
    expect(
      computeRetakeEligibility({
        settings,
        priorAttempts: [{ status: "started", finalizedAt: null }],
        now,
      }).allowed,
    ).toBe(false);
    expect(
      computeRetakeEligibility({
        settings,
        priorAttempts: [{ status: "pending_review", finalizedAt: null }],
        now,
      }).allowed,
    ).toBe(false);
    expect(
      computeRetakeEligibility({
        settings,
        priorAttempts: [
          { status: "passed", finalizedAt: "2026-07-28T10:00:00Z" },
        ],
        now,
      }).allowed,
    ).toBe(false);
  });

  test("attempt limits count failures but not abandonments", () => {
    const failed = {
      status: "failed" as const,
      finalizedAt: "2026-07-28T09:00:00Z",
    };
    expect(
      computeRetakeEligibility({
        settings,
        priorAttempts: [failed, failed],
        now,
      }),
    ).toEqual({ allowed: false, reason: expect.stringMatching(/limit/) });
    expect(
      computeRetakeEligibility({
        settings,
        priorAttempts: [failed, { status: "abandoned", finalizedAt: null }],
        now,
      }).allowed,
    ).toBe(true);
  });

  test("cooldown applies from the latest finalization", () => {
    const blocked = computeRetakeEligibility({
      settings,
      priorAttempts: [
        { status: "failed", finalizedAt: "2026-07-28T11:30:00Z" },
      ],
      now,
    });
    expect(blocked.allowed).toBe(false);
    const ready = computeRetakeEligibility({
      settings,
      priorAttempts: [
        { status: "failed", finalizedAt: "2026-07-28T10:59:00Z" },
      ],
      now,
    });
    expect(ready.allowed).toBe(true);
  });

  test("documented defaults: unlimited attempts, no cooldown, highest score", () => {
    expect(DEFAULT_ASSESSMENT_SETTINGS.maxAttempts).toBeUndefined();
    expect(DEFAULT_ASSESSMENT_SETTINGS.cooldownMinutes).toBe(0);
    expect(DEFAULT_ASSESSMENT_SETTINGS.scorePolicy).toBe("highest");
    expect(DEFAULT_ASSESSMENT_SETTINGS.passingPercent).toBe(70);
  });
});

describe("settings and certificates", () => {
  test("settings are bounded and reject unknown keys", () => {
    expect(() =>
      assessmentSettingsSchema.parse({ schemaVersion: 1, passingPercent: 0 }),
    ).toThrow();
    expect(() =>
      assessmentSettingsSchema.parse({ schemaVersion: 1, adaptive: true }),
    ).toThrow();
  });

  test("certificate templates are constrained plain text", () => {
    const template = certificateTemplateSchema.parse({
      schemaVersion: 1,
      title: "Certificate of Completion",
      signatories: [{ name: "Alex Rivera", role: "Program Director" }],
      expirationMonths: 24,
    });
    expect(template.showVerification).toBe(true);
    expect(() =>
      certificateTemplateSchema.parse({
        schemaVersion: 1,
        title: "x",
        css: "body{}",
      }),
    ).toThrow();
  });

  test("credential status: revocation wins; expiration is lazy", () => {
    const now = new Date("2026-07-28T12:00:00Z");
    expect(
      effectiveCredentialStatus({
        status: "active",
        expiresAt: "2026-07-01T00:00:00Z",
        now,
      }),
    ).toBe("expired");
    expect(
      effectiveCredentialStatus({
        status: "revoked",
        expiresAt: "2099-01-01T00:00:00Z",
        now,
      }),
    ).toBe("revoked");
    expect(
      effectiveCredentialStatus({ status: "active", expiresAt: null, now }),
    ).toBe("active");
  });

  test("verification identifiers are formatted, never raw UUIDs", () => {
    expect(VERIFICATION_CODE_PATTERN.test("NVK-1A2B-3C4D-5E6F-7A8B")).toBe(
      true,
    );
    expect(VERIFICATION_CODE_PATTERN.test(id(1))).toBe(false);
    expect(VERIFICATION_CODE_PATTERN.test("NVK-XXXX-YYYY-ZZZZ-0000")).toBe(
      false,
    );
  });
});

describe("event catalog additions", () => {
  test("all Phase 1D event types keep the three-segment taxonomy", () => {
    for (const type of EVENT_TYPES) {
      expect(type).toMatch(/^[a-z_]+\.[a-z_]+\.[a-z_]+$/);
    }
    expect(EVENT_TYPES).toContain("assessment.attempt.passed");
    expect(EVENT_TYPES).toContain("credential.certificate.issued");
    expect(EVENT_TYPES).toContain(
      "learning.completion.triggered_by_assessment",
    );
  });

  test("the envelope accepts the new types", () => {
    const envelope = eventEnvelopeSchema.parse({
      id: id(50),
      v: 1,
      type: "assessment.attempt.passed",
      organization_id: id(51),
      occurred_at: "2026-07-28T12:00:00Z",
      actor_user_id: null,
      subject_kind: "assessment_attempt",
      subject_id: id(52),
      context: { assessment_version_id: id(53) },
      data: { score_percent: 85 },
      correlation_id: null,
      causation_id: null,
    });
    expect(envelope.type).toBe("assessment.attempt.passed");
  });
});

describe("BFH contract schemas", () => {
  test("identity handoff claims are bounded and versioned", () => {
    const claims = identityHandoffClaimsSchema.parse({
      v: 1,
      organizationSlug: "bfh-dev",
      externalUserId: "bfh_1234",
      email: "member@example.com",
      accessLevel: "member",
      audiences: ["member"],
      issuedAt: 1_800_000_000,
      expiresAt: 1_800_000_120,
      nonce: "a".repeat(24),
    });
    expect(claims.accessLevel).toBe("member");
    expect(() => identityHandoffClaimsSchema.parse({ v: 2 })).toThrow();
  });

  test("enrollment requests carry idempotency keys and canonical targets", () => {
    const req = enrollmentRequestSchema.parse({
      v: 1,
      externalUserId: "bfh_1234",
      target: { type: "course", courseSlug: "bfh-foundations-program" },
      idempotencyKey: "enroll-bfh_1234-foundations",
    });
    expect(req.target.type).toBe("course");
  });

  test("webhooks never carry raw answers — only outcome and percent", () => {
    const hook = bfhWebhookSchema.parse({
      v: 1,
      type: "assessment.result",
      eventId: id(60),
      occurredAt: "2026-07-28T12:00:00Z",
      organizationSlug: "bfh-dev",
      externalUserId: "bfh_1234",
      assessmentSlug: "movement-screen-check",
      assessmentVersionNumber: 1,
      attemptNumber: 1,
      outcome: "passed",
      scorePercent: 92.5,
    });
    expect(JSON.stringify(hook)).not.toMatch(/response|answer/i);
  });
});
