import { describe, expect, it } from "vitest";
import {
  BFH_ACCESS_LEVEL_TO_ROLE_KEY,
  HANDOFF_MAX_LIFETIME_SECONDS,
  INTERNAL_TO_BFH_WEBHOOK_TYPE,
  buildAssessmentResultWebhook,
  buildCompletionWebhook,
  buildCredentialIssuedWebhook,
  isEligibleForAudience,
  isProjectableEventType,
  mapAccessLevelToRoleKey,
  resolveHandoffPath,
  rolesForHandoff,
  verifyHandoffClaims,
} from "./bfh-integration";
import { BFH_CONTRACT_VERSION } from "./bfh-contract";

const NOW = 1_800_000_000;

function claims(overrides: Record<string, unknown> = {}) {
  return {
    v: BFH_CONTRACT_VERSION,
    organizationSlug: "bfh-dev",
    externalUserId: "bfh-user-123",
    email: "member@example.com",
    accessLevel: "member",
    audiences: ["member"],
    issuedAt: NOW,
    expiresAt: NOW + 90,
    nonce: "0123456789abcdef0123",
    ...overrides,
  };
}

describe("access-level mapping", () => {
  it("maps every access level to exactly one system role key", () => {
    expect(mapAccessLevelToRoleKey("member")).toBe("learner");
    expect(mapAccessLevelToRoleKey("coach")).toBe("instructor");
    expect(mapAccessLevelToRoleKey("admin")).toBe("organization_admin");
  });

  it("never maps to owner (BFH cannot assert org ownership)", () => {
    expect(Object.values(BFH_ACCESS_LEVEL_TO_ROLE_KEY)).not.toContain(
      "organization_owner",
    );
  });
});

describe("audience model", () => {
  it("any audience grants learner; app role adds the serving role", () => {
    expect(rolesForHandoff("member", ["member"])).toEqual(["learner"]);
    expect(rolesForHandoff("coach", ["coach", "professional_learner"]).sort()).toEqual(
      ["instructor", "learner"],
    );
    expect(rolesForHandoff("admin", []).sort()).toEqual(["organization_admin"]);
  });

  it("a coach doing certification consumes as a learner", () => {
    expect(rolesForHandoff("coach", ["professional_learner"])).toContain(
      "learner",
    );
  });

  it("gates a Journey to its audience; open Journeys allow any learner", () => {
    expect(isEligibleForAudience(["member"], "member")).toBe(true);
    expect(isEligibleForAudience(["member"], "coach")).toBe(false);
    expect(isEligibleForAudience(["coach", "professional_learner"], "coach")).toBe(
      true,
    );
    expect(isEligibleForAudience(["member"], null)).toBe(true);
  });

  it("requires an explicit audiences claim (never inferred)", () => {
    const bad = verifyHandoffClaims(
      { ...claims(), audiences: [] },
      NOW,
    );
    expect(bad.ok).toBe(false);
  });
});

describe("verifyHandoffClaims", () => {
  it("accepts well-formed, in-window claims", () => {
    const result = verifyHandoffClaims(claims(), NOW);
    expect(result.ok).toBe(true);
  });

  it("rejects malformed claims", () => {
    const result = verifyHandoffClaims({ nope: true }, NOW);
    expect(result).toEqual({ ok: false, reason: "malformed handoff claims" });
  });

  it("rejects an expired token", () => {
    const result = verifyHandoffClaims(claims(), NOW + 1_000);
    expect(result.ok).toBe(false);
  });

  it("rejects a lifetime longer than 120s", () => {
    const result = verifyHandoffClaims(
      claims({ expiresAt: NOW + HANDOFF_MAX_LIFETIME_SECONDS + 1 }),
      NOW,
    );
    expect(result).toMatchObject({ ok: false });
  });

  it("rejects issuedAt in the future", () => {
    const result = verifyHandoffClaims(claims(), NOW - 1_000);
    expect(result.ok).toBe(false);
  });

  it("rejects expiresAt not after issuedAt", () => {
    const result = verifyHandoffClaims(
      claims({ issuedAt: NOW, expiresAt: NOW }),
      NOW,
    );
    expect(result.ok).toBe(false);
  });
});

describe("resolveHandoffPath", () => {
  it("keeps a valid same-tree learn path", () => {
    expect(resolveHandoffPath("bfh-dev", "/bfh-dev/learn/abc/courses/x")).toBe(
      "/bfh-dev/learn/abc/courses/x",
    );
  });

  it("keeps the learning home itself", () => {
    expect(resolveHandoffPath("bfh-dev", "/bfh-dev/learn")).toBe(
      "/bfh-dev/learn",
    );
  });

  it.each([
    ["null", null],
    ["off-tree", "/bfh-dev/admin/members"],
    ["another org", "/other-org/learn/x"],
    ["protocol-relative", "//evil.example.com"],
    ["absolute url", "https://evil.example.com"],
    ["traversal", "/bfh-dev/learn/../admin"],
    ["prefix trick", "/bfh-dev/learning-evil"],
  ])("falls back to home for %s", (_label, path) => {
    expect(resolveHandoffPath("bfh-dev", path)).toBe("/bfh-dev/learn");
  });
});

describe("outbound projection", () => {
  it("maps only the five projectable internal events", () => {
    expect(Object.keys(INTERNAL_TO_BFH_WEBHOOK_TYPE).sort()).toEqual([
      "assessment.attempt.failed",
      "assessment.attempt.passed",
      "credential.certificate.issued",
      "learning.course.completed",
      "learning.path.completed",
    ]);
    expect(isProjectableEventType("learning.course.completed")).toBe(true);
    expect(isProjectableEventType("studio.session.opened")).toBe(false);
  });

  const identity = {
    eventId: "11111111-1111-4111-8111-111111111111",
    occurredAt: "2026-07-29T22:00:00.000Z",
    organizationSlug: "bfh-dev",
    externalUserId: "bfh-user-123",
  };

  it("builds a valid course completion payload", () => {
    const wh = buildCompletionWebhook(identity, {
      kind: "course",
      courseSlug: "coaching-fundamentals",
      courseVersionNumber: 1,
    });
    expect(wh.type).toBe("learning.completion");
    expect(wh.target).toMatchObject({ kind: "course", courseVersionNumber: 1 });
  });

  it("builds a valid assessment result payload (percent only)", () => {
    const wh = buildAssessmentResultWebhook(identity, {
      assessmentSlug: "intake-evaluation",
      assessmentVersionNumber: 2,
      attemptNumber: 1,
      outcome: "passed",
      scorePercent: 92,
    });
    expect(wh.outcome).toBe("passed");
    expect(wh.scorePercent).toBe(92);
  });

  it("builds a valid credential issued payload", () => {
    const wh = buildCredentialIssuedWebhook(identity, {
      credentialTitle: "Certified Coach — Foundations",
      verificationCode: "NVK-XXXX-YYYY-ZZZZ-1234",
      issuedAt: "2026-07-29T22:00:00.000Z",
      expiresAt: null,
    });
    expect(wh.type).toBe("credential.issued");
    expect(wh.expiresAt).toBeNull();
  });

  it("rejects an out-of-range score", () => {
    expect(() =>
      buildAssessmentResultWebhook(identity, {
        assessmentSlug: "x",
        assessmentVersionNumber: 1,
        attemptNumber: 1,
        outcome: "failed",
        scorePercent: 130,
      }),
    ).toThrow();
  });
});
