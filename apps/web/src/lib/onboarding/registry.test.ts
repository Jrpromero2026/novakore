import { describe, expect, test } from "vitest";
import {
  isPermission,
  PLATFORM_TERM_DEFAULTS,
  type TermKey,
} from "@novakore/domain";
import {
  availableWalkthroughs,
  getWalkthrough,
  WALKTHROUGHS,
} from "./registry";
import { TOUR_TARGETS } from "./targets";
import { CHECKLIST_STEP_IDS, CHECKLIST_STEPS } from "./steps";

/**
 * Registry validation — CI-time referential integrity for the walkthrough
 * system: unique ids, real targets, valid permissions, valid checklist
 * links, and renderable copy under default terminology.
 */

const term = (key: TermKey) => PLATFORM_TERM_DEFAULTS[key];
const VALID_TARGETS = new Set<string>(Object.values(TOUR_TARGETS));

describe("walkthrough registry validation", () => {
  test("walkthrough ids are unique and slug-like", () => {
    const ids = WALKTHROUGHS.map((w) => w.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z][a-z0-9-]{1,59}$/);
  });

  test("versions are positive integers", () => {
    for (const w of WALKTHROUGHS) {
      expect(Number.isInteger(w.version)).toBe(true);
      expect(w.version).toBeGreaterThanOrEqual(1);
    }
  });

  test("every step references a registered durable target", () => {
    for (const w of WALKTHROUGHS) {
      for (const step of w.steps) {
        expect(VALID_TARGETS.has(step.target)).toBe(true);
        if (step.fallbackTarget) {
          expect(VALID_TARGETS.has(step.fallbackTarget)).toBe(true);
        }
      }
    }
  });

  test("step ids are unique within each walkthrough", () => {
    for (const w of WALKTHROUGHS) {
      const ids = w.steps.map((s) => s.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  test("permission gates are non-empty and use real permission codes", () => {
    for (const w of WALKTHROUGHS) {
      expect(w.needsAny.length).toBeGreaterThan(0);
      for (const p of w.needsAny) expect(isPermission(p)).toBe(true);
    }
  });

  test("condition steps always define a completion predicate", () => {
    for (const w of WALKTHROUGHS) {
      for (const step of w.steps) {
        if (step.advance === "condition") {
          expect(typeof step.completeWhen).toBe("function");
        }
      }
    }
  });

  test("checklist links point at real checklist steps, and vice versa", () => {
    const validStepIds = new Set<string>(CHECKLIST_STEP_IDS);
    for (const w of WALKTHROUGHS) {
      if (w.checklistStep) expect(validStepIds.has(w.checklistStep)).toBe(true);
    }
    // Every checklist "Show me" resolves to a registered walkthrough with a
    // compatible permission gate (no dead buttons, no privilege mismatch).
    for (const step of CHECKLIST_STEPS) {
      const w = getWalkthrough(step.walkthroughId);
      expect(w, `walkthrough ${step.walkthroughId} missing`).toBeDefined();
      expect(w!.checklistStep).toBe(step.id);
      for (const p of step.needsAny) expect(isPermission(p)).toBe(true);
    }
  });

  test("copy renders non-empty under platform-default terminology", () => {
    for (const w of WALKTHROUGHS) {
      expect(w.title(term).trim().length).toBeGreaterThan(3);
      expect(w.description(term).trim().length).toBeGreaterThan(3);
      for (const step of w.steps) {
        expect(step.title(term).trim().length).toBeGreaterThan(3);
        expect(step.body(term).trim().length).toBeGreaterThan(10);
        expect(step.route("/acme/admin").startsWith("/acme/")).toBe(true);
      }
    }
  });

  test("routes derive from the provided base — no hardcoded tenant paths", () => {
    for (const w of WALKTHROUGHS) {
      for (const step of w.steps) {
        const a = step.route("/tenant-a/admin");
        const b = step.route("/tenant-b/admin");
        expect(a).toContain("/tenant-a/");
        expect(b).toContain("/tenant-b/");
        expect(a).not.toContain("tenant-b");
      }
    }
  });
});

describe("permission-aware availability", () => {
  test("no permissions yields no walkthroughs", () => {
    expect(availableWalkthroughs([])).toHaveLength(0);
  });

  test("filtering is any-of per walkthrough", () => {
    const forAuthors = availableWalkthroughs(["content.author"]);
    expect(forAuthors.some((w) => w.id === "create-program")).toBe(true);
    expect(forAuthors.some((w) => w.id === "invite-learner")).toBe(false);
    expect(forAuthors.some((w) => w.id === "branding")).toBe(false);
  });

  test("retired walkthroughs resolve to undefined without throwing", () => {
    expect(getWalkthrough("does-not-exist")).toBeUndefined();
  });
});

describe("completion predicates read only real state", () => {
  const ctx = (html: string, pathname: string, base = "/acme/admin") => {
    document.body.innerHTML = html;
    return { pathname, base, doc: document };
  };

  test("create-journey completes only when a real path count appears", () => {
    const step = getWalkthrough("create-journey")!.steps.at(-1)!;
    expect(
      step.completeWhen!(
        ctx(`<div data-tour-state-paths="0"></div>`, "/acme/admin/learning"),
      ),
    ).toBe(false);
    expect(
      step.completeWhen!(
        ctx(`<div data-tour-state-paths="1"></div>`, "/acme/admin/learning"),
      ),
    ).toBe(true);
  });

  test("absent state markers never complete a step (missing ≠ done)", () => {
    const step = getWalkthrough("create-program")!.steps.at(-1)!;
    expect(step.completeWhen!(ctx(`<div></div>`, "/acme/admin/courses"))).toBe(
      false,
    );
  });

  test("nav steps complete from the live route", () => {
    const step = getWalkthrough("invite-learner")!.steps[0]!;
    expect(step.completeWhen!(ctx("", "/acme/admin"))).toBe(false);
    expect(step.completeWhen!(ctx("", "/acme/admin/members"))).toBe(true);
  });

  test("learner-preview nav step completes on the learn surface", () => {
    const step = getWalkthrough("learner-preview")!.steps[0]!;
    expect(step.completeWhen!(ctx("", "/acme/admin"))).toBe(false);
    expect(step.completeWhen!(ctx("", "/acme/learn"))).toBe(true);
  });
});
