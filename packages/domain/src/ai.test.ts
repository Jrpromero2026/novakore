import { describe, expect, test } from "vitest";
import {
  AI_OPERATIONS,
  AI_OUTPUT_SCHEMAS,
  PLATFORM_AI_BUDGET_CENTS,
  canTransitionGeneration,
  checkBudget,
  estimateCostCents,
  generationRequestSchema,
  monthKey,
  normalizeProviderError,
  reservationCents,
  validateAiOutput,
} from "./ai";
import {
  backoffSeconds,
  checkWebhookDestination,
  isForbiddenResolvedAddress,
  redactResponseExcerpt,
  signingInput,
} from "./webhooks";

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

describe("AI cost math (integer cents, never floats)", () => {
  test("estimates ceil and never round to free", () => {
    expect(estimateCostCents("drafting", 1, 1)).toBe(2); // each side ceils to 1
    expect(estimateCostCents("drafting", 1_000_000, 0)).toBe(300);
    expect(estimateCostCents("drafting", 0, 1_000_000)).toBe(1_500);
    expect(estimateCostCents("rewrite", 1_000_000, 1_000_000)).toBe(480);
    expect(
      Number.isInteger(estimateCostCents("structured", 123_456, 78_901)),
    ).toBe(true);
  });

  test("reservations are conservative and profile-aware", () => {
    expect(reservationCents("drafting")).toBeGreaterThan(
      reservationCents("rewrite"),
    );
    expect(reservationCents("drafting")).toBe(9); // 3 + 6 cents
  });

  test("the platform cap is the owner-approved $50", () => {
    expect(PLATFORM_AI_BUDGET_CENTS).toBe(5_000);
  });
});

describe("budget enforcement math", () => {
  test("hard stop when a request would exceed the limit", () => {
    const blocked = checkBudget({
      limitCents: 5_000,
      committedCents: 4_990,
      reservedCents: 5,
      requestCents: 9,
    });
    expect(blocked.allowed).toBe(false);
    expect(blocked.remainingCents).toBe(5);

    const allowed = checkBudget({
      limitCents: 5_000,
      committedCents: 100,
      reservedCents: 0,
      requestCents: 9,
    });
    expect(allowed).toEqual({ allowed: true, remainingCents: 4_891 });
  });

  test("organization limits can never exceed the platform cap", () => {
    const capped = checkBudget({
      limitCents: 999_999,
      committedCents: 4_999,
      reservedCents: 0,
      requestCents: 2,
    });
    expect(capped.allowed).toBe(false); // capped at 5000, not 999999
  });

  test("month keys are UTC calendar months", () => {
    expect(monthKey(new Date("2026-07-31T23:59:59Z"))).toBe("2026-07");
    expect(monthKey(new Date("2026-08-01T00:00:00Z"))).toBe("2026-08");
  });
});

describe("structured output validation", () => {
  test("every operation has a registered schema", () => {
    for (const op of AI_OPERATIONS) {
      expect(AI_OUTPUT_SCHEMAS[op]).toBeDefined();
    }
  });

  test("lesson drafts must be REAL validated blocks", () => {
    const good = validateAiOutput("lesson_draft", {
      title: "Drafted Lesson",
      blocks: [
        {
          id: id(1),
          type: "rich_text",
          schemaVersion: 1,
          position: "a0",
          data: { text: "Generated body." },
        },
      ],
    });
    expect(good.ok).toBe(true);

    const bad = validateAiOutput("lesson_draft", {
      title: "Bad",
      blocks: [{ type: "rich_text", html: "<script>x</script>" }],
    });
    expect(bad.ok).toBe(false);
  });

  test("invalid knowledge checks fail safely with a path", () => {
    const result = validateAiOutput("knowledge_checks", {
      checks: [{ prompt: "Q", options: ["only one"], correctIndex: 0 }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/checks\.0\.options/);
  });

  test("generation requests bound source excerpts and cap count", () => {
    const request = generationRequestSchema.parse({
      operation: "course_outline",
      profile: "structured",
      objective: "Outline an onboarding course",
      sources: [
        { sourceDocumentId: id(2), title: "Handbook", excerpt: "Welcome." },
      ],
    });
    expect(request.sources).toHaveLength(1);
    expect(() =>
      generationRequestSchema.parse({
        operation: "nope",
        profile: "structured",
        objective: "x",
      }),
    ).toThrow();
  });
});

describe("provider error normalization", () => {
  test("statuses map to stable retryable kinds", () => {
    expect(normalizeProviderError({ status: 429 })).toMatchObject({
      kind: "rate_limited",
      retryable: true,
    });
    expect(normalizeProviderError({ status: 401 })).toMatchObject({
      kind: "auth",
      retryable: false,
    });
    expect(normalizeProviderError({ status: 529 })).toMatchObject({
      kind: "overloaded",
      retryable: true,
    });
    expect(normalizeProviderError({ code: "timeout" }).kind).toBe("timeout");
    expect(normalizeProviderError({}).kind).toBe("unknown");
  });
});

describe("generation lifecycle", () => {
  test("reserved resolves once; resolved states are terminal", () => {
    expect(canTransitionGeneration("reserved", "completed")).toBe(true);
    expect(canTransitionGeneration("reserved", "failed")).toBe(true);
    expect(canTransitionGeneration("completed", "accepted")).toBe(true);
    expect(canTransitionGeneration("completed", "rejected")).toBe(true);
    expect(canTransitionGeneration("accepted", "rejected")).toBe(false);
    expect(canTransitionGeneration("failed", "completed")).toBe(false);
  });
});

describe("webhook destination policy (SSRF)", () => {
  test("https public destinations pass; everything private fails", () => {
    expect(checkWebhookDestination("https://hooks.example.com/x").allowed).toBe(
      true,
    );
    for (const bad of [
      "http://hooks.example.com/x", // plain http
      "https://localhost/x",
      "https://127.0.0.1/x",
      "https://10.1.2.3/x",
      "https://192.168.1.5/x",
      "https://172.16.0.9/x",
      "https://169.254.169.254/latest/meta-data",
      "https://metadata.google.internal/computeMetadata",
      "https://internal-api.local/x",
      "https://user:pass@example.com/x",
      "not-a-url",
    ]) {
      expect(checkWebhookDestination(bad).allowed, bad).toBe(false);
    }
  });

  test("localhost is a documented development exception only when opted in", () => {
    expect(
      checkWebhookDestination("http://localhost:9999/hook", {
        allowLocalhost: true,
      }).allowed,
    ).toBe(true);
    expect(checkWebhookDestination("http://localhost:9999/hook").allowed).toBe(
      false,
    );
  });

  test("resolved private addresses are rejected post-DNS", () => {
    expect(isForbiddenResolvedAddress("10.0.0.5")).toBe(true);
    expect(isForbiddenResolvedAddress("169.254.169.254")).toBe(true);
    expect(isForbiddenResolvedAddress("52.10.20.30")).toBe(false);
  });

  test("backoff is bounded exponential; signing input is canonical", () => {
    expect(backoffSeconds(1)).toBe(60);
    expect(backoffSeconds(2)).toBe(300);
    expect(backoffSeconds(3)).toBe(1_500);
    expect(backoffSeconds(9)).toBe(7_200); // cap
    expect(signingInput(1_800_000_000, '{"a":1}')).toBe('1800000000.{"a":1}');
  });

  test("response excerpts redact obvious secrets", () => {
    const redacted = redactResponseExcerpt(
      '{"ok":true,"api_key":"sk-supersecret","authorization":"Bearer abc123"}',
    );
    expect(redacted).not.toContain("sk-supersecret");
    expect(redacted).not.toContain("abc123");
    expect(redacted).toContain("[redacted]");
  });
});
