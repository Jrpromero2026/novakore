import { describe, expect, it } from "vitest";
import { PERMISSIONS, VIEW_ONLY_PERMISSIONS } from "@novakore/domain";
import {
  orgWriteBlockedMessage,
  permissionAllowedUnderOrgStatus,
} from "./read-limited";

describe("read-limited organizations", () => {
  it("an active organization gates nothing", () => {
    for (const p of PERMISSIONS) {
      expect(permissionAllowedUnderOrgStatus("active", p)).toBe(true);
    }
    expect(orgWriteBlockedMessage("active")).toBeNull();
  });

  it("a suspended organization keeps exactly the view-only permissions", () => {
    for (const p of PERMISSIONS) {
      expect(permissionAllowedUnderOrgStatus("suspended", p)).toBe(
        (VIEW_ONLY_PERMISSIONS as readonly string[]).includes(p),
      );
    }
  });

  it("every mutating permission is refused when not active", () => {
    // The ones an attacker (or a bad day) would reach for first.
    for (const p of [
      "content.author",
      "content.publish",
      "org.manage",
      "org.members.manage",
      "enrollment.manage",
      "enrollment.self",
      "credential.issue",
      "progress.override",
      "ai.author.use",
    ] as const) {
      expect(permissionAllowedUnderOrgStatus("suspended", p)).toBe(false);
      expect(permissionAllowedUnderOrgStatus("archived", p)).toBe(false);
    }
  });

  it("view-only classification only contains reads", () => {
    for (const p of VIEW_ONLY_PERMISSIONS) {
      expect(p.includes("view") || p === "audit.view").toBe(true);
    }
  });

  it("unknown statuses fail closed to read-limited", () => {
    expect(permissionAllowedUnderOrgStatus("garbage", "content.author")).toBe(
      false,
    );
    expect(orgWriteBlockedMessage("garbage")).not.toBeNull();
  });
});
